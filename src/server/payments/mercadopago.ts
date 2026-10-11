/**
 * Cliente HTTP mínimo de la API oficial de Mercado Pago (sin SDK, para controlar timeouts,
 * idempotencia y que ningún token llegue a logs).
 *
 * Endpoints usados (documentación oficial de Mercado Pago Developers):
 *  - OAuth:        GET  {MP_AUTH_URL}/authorization?client_id&response_type=code&platform_id=mp&state&redirect_uri
 *                  POST https://api.mercadopago.com/oauth/token   (authorization_code | refresh_token)
 *  - Preferencias: POST https://api.mercadopago.com/checkout/preferences
 *  - Pagos:        GET  https://api.mercadopago.com/v1/payments/{id}
 *  - Reembolsos:   POST https://api.mercadopago.com/v1/payments/{id}/refunds
 *  - Usuario:      GET  https://api.mercadopago.com/users/me
 * Verificá estos endpoints contra la documentación vigente antes de pasar a producción.
 */
import { hmacSha256Hex, safeEqualHex } from "@/lib/crypto";

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

export function mpConfig() {
  return {
    apiUrl: process.env.MP_API_URL || "https://api.mercadopago.com",
    authUrl: process.env.MP_AUTH_URL || "https://auth.mercadopago.com.ar",
    clientId: process.env.MP_CLIENT_ID || "",
    clientSecret: process.env.MP_CLIENT_SECRET || "",
    webhookSecret: process.env.MP_WEBHOOK_SECRET || "",
    requireSignature: process.env.MP_WEBHOOK_REQUIRE_SIGNATURE === "true",
    testToken: process.env.MP_OAUTH_TEST_TOKEN === "true",
    platformFeePercent: Number(process.env.MP_PLATFORM_FEE_PERCENT || "0"),
    allowManualCredentials: process.env.MP_ALLOW_MANUAL_CREDENTIALS === "true",
  };
}

export function oauthConfigured() {
  const c = mpConfig();
  return Boolean(c.clientId && c.clientSecret);
}

async function mpFetch<T>(path: string, init: RequestInit & { token?: string; idempotencyKey?: string } = {}): Promise<T> {
  const { token, idempotencyKey, ...rest } = init;
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${mpConfig().apiUrl}${path}`, { ...rest, headers, signal: AbortSignal.timeout(15000), cache: "no-store" });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    throw new MercadoPagoError(`Mercado Pago: ${msg}`, res.status, body);
  }
  return body as T;
}

// ───────────── OAuth ─────────────

export type MpTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token?: string;
  public_key?: string;
  live_mode?: boolean;
};

export function buildAuthorizationUrl(state: string, redirectUri: string) {
  const c = mpConfig();
  const u = new URL("/authorization", c.authUrl);
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("platform_id", "mp");
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", redirectUri);
  return u.toString();
}

export function exchangeAuthorizationCode(code: string, redirectUri: string) {
  const c = mpConfig();
  return mpFetch<MpTokenResponse>("/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(c.testToken ? { test_token: "true" } : {}),
    }),
  });
}

export function refreshAccessToken(refreshToken: string) {
  const c = mpConfig();
  return mpFetch<MpTokenResponse>("/oauth/token", {
    method: "POST",
    body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
  });
}

export function getMe(token: string) {
  return mpFetch<{ id: number; nickname?: string; email?: string; site_id?: string }>("/users/me", { token });
}

// ───────────── Preferencias y pagos ─────────────

export type MpPreferenceInput = {
  items: { id: string; title: string; quantity: number; unit_price: number; currency_id: "ARS"; picture_url?: string }[];
  payer?: { email?: string; name?: string };
  external_reference: string;
  notification_url?: string;
  back_urls: { success: string; failure: string; pending: string };
  auto_return?: "approved" | "all";
  expires?: boolean;
  expiration_date_to?: string;
  marketplace_fee?: number;
  statement_descriptor?: string;
  metadata?: Record<string, string>;
};

export type MpPreference = { id: string; init_point: string; sandbox_init_point?: string };

export function createPreference(token: string, input: MpPreferenceInput, idempotencyKey: string) {
  return mpFetch<MpPreference>("/checkout/preferences", { method: "POST", token, idempotencyKey, body: JSON.stringify(input) });
}

export type MpPayment = {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  status_detail?: string;
  transaction_amount: number;
  currency_id: string;
  external_reference?: string | null;
  collector_id?: number;
  date_approved?: string | null;
  live_mode?: boolean;
};

export function getPayment(token: string, paymentId: string) {
  if (!/^\d{1,20}$/.test(paymentId)) throw new MercadoPagoError("Id de pago inválido", 400);
  return mpFetch<MpPayment>(`/v1/payments/${paymentId}`, { token });
}

export function createRefund(token: string, paymentId: string, idempotencyKey: string, amount?: number) {
  if (!/^\d{1,20}$/.test(paymentId)) throw new MercadoPagoError("Id de pago inválido", 400);
  return mpFetch<{ id: number; status: string; amount: number }>(`/v1/payments/${paymentId}/refunds`, {
    method: "POST",
    token,
    idempotencyKey,
    body: JSON.stringify(amount ? { amount } : {}),
  });
}

// ───────────── Webhooks ─────────────

/**
 * Valida el header x-signature ("ts=...,v1=...") de una notificación.
 * Manifest: "id:{data.id};request-id:{x-request-id};ts:{ts};" — HMAC-SHA256 con la clave secreta
 * de webhooks de la aplicación. data.id alfanumérico se pasa a minúsculas. Las partes ausentes se omiten.
 */
export function verifyWebhookSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
  toleranceSeconds?: number;
  now?: number;
}): { ok: boolean; reason?: string } {
  const { xSignature, xRequestId, dataId, secret } = params;
  if (!secret) return { ok: false, reason: "secret-not-configured" };
  if (!xSignature) return { ok: false, reason: "missing-signature" };
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of xSignature.split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k === "ts") ts = v;
    if (k === "v1") v1 = v;
  }
  if (!ts || !v1) return { ok: false, reason: "malformed-signature" };
  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;
  const expected = hmacSha256Hex(secret, manifest);
  if (!safeEqualHex(expected, v1.toLowerCase())) return { ok: false, reason: "bad-signature" };
  if (params.toleranceSeconds) {
    // ts puede venir en segundos o milisegundos
    const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
    if (Math.abs((params.now ?? Date.now()) - tsMs) > params.toleranceSeconds * 1000) return { ok: false, reason: "stale" };
  }
  return { ok: true };
}

export function mapPaymentStatus(s: MpPayment["status"]) {
  switch (s) {
    case "approved":
      return "APPROVED" as const;
    case "authorized":
    case "in_process":
    case "in_mediation":
      return "IN_PROCESS" as const;
    case "rejected":
      return "REJECTED" as const;
    case "cancelled":
      return "CANCELLED" as const;
    case "refunded":
      return "REFUNDED" as const;
    case "charged_back":
      return "CHARGED_BACK" as const;
    default:
      return "PENDING" as const;
  }
}
