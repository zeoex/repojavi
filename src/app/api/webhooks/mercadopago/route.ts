import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { mpConfig, verifyWebhookSignature } from "@/server/payments/mercadopago";
import { handleMercadoPagoNotification } from "@/server/services/payments";
import { systemEvent } from "@/server/services/audit";

export const dynamic = "force-dynamic";

/**
 * Webhook de Mercado Pago.
 *  1. Valida la firma x-signature (HMAC-SHA256 con MP_WEBHOOK_SECRET) cuando viene presente.
 *  2. Identifica el comercio (user_id del vendedor o ?m= de la notification_url).
 *  3. NO confía en el contenido: consulta el pago real en la API con el token del comercio.
 *  4. Procesamiento idempotente (eventKey + bloqueo del pedido + flags de stock).
 */
export async function POST(req: NextRequest) {
  const url = req.nextUrl;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const data = (body.data ?? {}) as { id?: string | number };
  const topic = String(url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body.type ?? body.topic ?? "");
  const resourceId = String(url.searchParams.get("data.id") ?? data.id ?? url.searchParams.get("id") ?? "");

  if (topic !== "payment" || !/^\d{1,20}$/.test(resourceId)) {
    // Otros tópicos (merchant_order, etc.) no se usan: se confirman para que MP no reintente.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const cfg = mpConfig();
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  let signatureOk = false;
  if (xSignature) {
    const v = verifyWebhookSignature({ xSignature, xRequestId, dataId: url.searchParams.get("data.id") ?? resourceId, secret: cfg.webhookSecret });
    if (!v.ok) {
      await systemEvent("warn", "mercadopago", "Webhook con firma inválida rechazado", { reason: v.reason, resourceId });
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    signatureOk = true;
  } else if (cfg.requireSignature) {
    await systemEvent("warn", "mercadopago", "Webhook sin firma rechazado (MP_WEBHOOK_REQUIRE_SIGNATURE=true)", { resourceId });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Identificación del comercio
  const sellerId = body.user_id != null ? String(body.user_id) : null;
  const hintedMerchant = url.searchParams.get("m");
  let merchantId: string | null = null;
  if (sellerId) {
    const acc = await prisma.merchantPaymentAccount.findFirst({ where: { providerUserId: sellerId }, select: { merchantId: true } });
    merchantId = acc?.merchantId ?? null;
    if (merchantId && hintedMerchant && hintedMerchant !== merchantId) {
      await systemEvent("warn", "mercadopago", "Webhook con comercio inconsistente", { resourceId });
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  }
  if (!merchantId && hintedMerchant) {
    const acc = await prisma.merchantPaymentAccount.findUnique({ where: { merchantId: hintedMerchant }, select: { merchantId: true } });
    merchantId = acc?.merchantId ?? null;
  }
  if (!merchantId) {
    await systemEvent("warn", "mercadopago", "Webhook de un vendedor desconocido", { resourceId });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const r = await handleMercadoPagoNotification({
      merchantId,
      topic,
      resourceId,
      requestId: xRequestId,
      signatureOk,
      payload: { topic, resourceId, action: typeof body.action === "string" ? body.action : null, live_mode: body.live_mode ?? null },
    });
    return NextResponse.json({ ok: true, duplicate: r.duplicate });
  } catch {
    // 500 → Mercado Pago reintenta la notificación
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
