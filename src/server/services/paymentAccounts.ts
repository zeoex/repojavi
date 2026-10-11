import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret, hmacSha256Hex, randomToken, safeEqualHex } from "@/lib/crypto";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { type Actor, assertMerchantAccess } from "@/server/actor";
import { audit, systemEvent } from "./audit";
import {
  MercadoPagoError,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  getMe,
  mpConfig,
  oauthConfigured,
  refreshAccessToken,
  type MpTokenResponse,
} from "@/server/payments/mercadopago";

export function appUrl() {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function mpRedirectUri() {
  return `${appUrl()}/api/mercadopago/oauth/callback`;
}

/**
 * state firmado: merchantId.userId.nonce.exp.firma  — además el nonce se guarda en una cookie httpOnly
 * para atar el flujo al navegador que lo inició (protección CSRF del OAuth).
 */
export function signOAuthState(merchantId: string, userId: string, nonce: string, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${merchantId}.${userId}.${nonce}.${exp}`;
  return `${payload}.${hmacSha256Hex(process.env.NEXTAUTH_SECRET || "", `mp-oauth:${payload}`)}`;
}

export function verifyOAuthState(state: string) {
  const parts = state.split(".");
  if (parts.length !== 5) return null;
  const [merchantId, userId, nonce, exp, sig] = parts;
  const expected = hmacSha256Hex(process.env.NEXTAUTH_SECRET || "", `mp-oauth:${merchantId}.${userId}.${nonce}.${exp}`);
  if (!safeEqualHex(expected, sig)) return null;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return { merchantId, userId, nonce };
}

export async function startMercadoPagoConnect(actor: Actor, merchantId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: false });
  if (!oauthConfigured()) throw new ConflictError("La plataforma todavía no configuró su aplicación de Mercado Pago (MP_CLIENT_ID / MP_CLIENT_SECRET).");
  const nonce = randomToken(16);
  const state = signOAuthState(merchantId, actor.userId, nonce);
  return { url: buildAuthorizationUrl(state, mpRedirectUri()), nonce };
}

async function saveTokens(merchantId: string, t: MpTokenResponse) {
  const data = {
    providerUserId: String(t.user_id),
    accessTokenEnc: encryptSecret(t.access_token),
    refreshTokenEnc: t.refresh_token ? encryptSecret(t.refresh_token) : null,
    publicKey: t.public_key ?? null,
    scope: t.scope ?? null,
    liveMode: Boolean(t.live_mode),
    expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    status: "CONNECTED" as const,
    lastError: null,
  };
  // Una cuenta de MP no puede quedar asociada a dos comercios distintos.
  const clash = await prisma.merchantPaymentAccount.findFirst({ where: { providerUserId: data.providerUserId, merchantId: { not: merchantId }, status: "CONNECTED" } });
  if (clash) throw new ConflictError("Esa cuenta de Mercado Pago ya está conectada a otro comercio.");
  return prisma.merchantPaymentAccount.upsert({ where: { merchantId }, create: { merchantId, ...data }, update: { ...data, connectedAt: new Date() } });
}

export async function completeMercadoPagoConnect(actor: Actor, state: string, code: string, cookieNonce: string | undefined) {
  const parsed = verifyOAuthState(state);
  if (!parsed || !cookieNonce || !safeEqualHex(parsed.nonce, cookieNonce)) throw new ForbiddenError("La autorización expiró o no es válida. Probá de nuevo.");
  if (parsed.userId !== actor.userId) throw new ForbiddenError();
  await assertMerchantAccess(actor, parsed.merchantId, { allowSuperadmin: false });
  try {
    const tokens = await exchangeAuthorizationCode(code, mpRedirectUri());
    await saveTokens(parsed.merchantId, tokens);
  } catch (e) {
    await systemEvent("error", "mercadopago", "Falló el intercambio de código OAuth", { status: (e as MercadoPagoError).status }, parsed.merchantId);
    throw e instanceof ConflictError ? e : new ConflictError("Mercado Pago rechazó la conexión. Probá de nuevo.");
  }
  await audit({ actorId: actor.userId, action: "mercadopago.connect", entityType: "MerchantPaymentAccount", entityId: parsed.merchantId, merchantId: parsed.merchantId });
  return parsed.merchantId;
}

/**
 * Carga manual de credenciales del vendedor (Access Token de PRUEBA de un usuario de prueba).
 * Solo habilitado con MP_ALLOW_MANUAL_CREDENTIALS=true, pensado para sandbox.
 */
export async function connectWithManualCredentials(actor: Actor, merchantId: string, accessToken: string, publicKey?: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: false });
  if (!mpConfig().allowManualCredentials) throw new ForbiddenError("La carga manual de credenciales está deshabilitada.");
  const token = accessToken.trim();
  if (!/^(TEST|APP_USR)-[\w-]{20,}$/.test(token)) throw new ValidationError("El Access Token no tiene un formato válido.");
  let me;
  try {
    me = await getMe(token);
  } catch {
    throw new ValidationError("Mercado Pago no aceptó ese Access Token.");
  }
  await saveTokens(merchantId, {
    access_token: token,
    token_type: "bearer",
    expires_in: 0,
    scope: "manual",
    user_id: me.id,
    public_key: publicKey?.trim() || undefined,
    live_mode: token.startsWith("APP_USR"),
  });
  await audit({ actorId: actor.userId, action: "mercadopago.connect.manual", entityType: "MerchantPaymentAccount", entityId: merchantId, merchantId });
}

export async function disconnectMercadoPago(actor: Actor, merchantId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  await prisma.merchantPaymentAccount.deleteMany({ where: { merchantId } });
  await audit({ actorId: actor.userId, action: "mercadopago.disconnect", entityType: "MerchantPaymentAccount", entityId: merchantId, merchantId });
}

/** Estado público (sin tokens) de la conexión. */
export async function getPaymentAccountStatus(merchantId: string) {
  const a = await prisma.merchantPaymentAccount.findUnique({ where: { merchantId } });
  if (!a) return null;
  return { status: a.status, providerUserId: a.providerUserId, liveMode: a.liveMode, expiresAt: a.expiresAt, connectedAt: a.connectedAt, lastError: a.lastError };
}

const REFRESH_MARGIN_MS = 7 * 24 * 3600 * 1000;

/** Devuelve un access token válido del comercio, renovándolo si está por vencer. Nunca lo expone fuera del servidor. */
export async function getMerchantAccessToken(merchantId: string): Promise<{ token: string; providerUserId: string; liveMode: boolean }> {
  const acc = await prisma.merchantPaymentAccount.findUnique({ where: { merchantId } });
  if (!acc || acc.status === "REVOKED") throw new ConflictError("El comercio no tiene Mercado Pago conectado.");
  const expiring = acc.expiresAt && acc.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;
  if (expiring) {
    if (!acc.refreshTokenEnc) {
      if (acc.expiresAt! < new Date()) {
        await prisma.merchantPaymentAccount.update({ where: { merchantId }, data: { status: "EXPIRED" } });
        throw new ConflictError("La conexión con Mercado Pago venció. El comercio debe reconectar su cuenta.");
      }
    } else {
      try {
        const t = await refreshAccessToken(decryptSecret(acc.refreshTokenEnc));
        const saved = await saveTokens(merchantId, t);
        return { token: t.access_token, providerUserId: saved.providerUserId, liveMode: saved.liveMode };
      } catch (e) {
        await prisma.merchantPaymentAccount.update({ where: { merchantId }, data: { status: "ERROR", lastError: "No se pudo renovar el token" } });
        await systemEvent("error", "mercadopago", "Falló la renovación del token del comercio", { status: (e as MercadoPagoError).status }, merchantId);
        if (acc.expiresAt! < new Date()) throw new ConflictError("La conexión con Mercado Pago venció. El comercio debe reconectar su cuenta.");
      }
    }
  }
  if (acc.status !== "CONNECTED" && !(acc.status === "ERROR" && acc.expiresAt && acc.expiresAt > new Date()))
    throw new ConflictError("La conexión con Mercado Pago del comercio no está activa.");
  return { token: decryptSecret(acc.accessTokenEnc), providerUserId: acc.providerUserId, liveMode: acc.liveMode };
}

export async function markAccountUnauthorized(merchantId: string) {
  await prisma.merchantPaymentAccount.updateMany({ where: { merchantId }, data: { status: "REVOKED", lastError: "Mercado Pago rechazó las credenciales (401)" } });
  await systemEvent("error", "mercadopago", "Credenciales del comercio rechazadas (401). Debe reconectar.", {}, merchantId);
}
