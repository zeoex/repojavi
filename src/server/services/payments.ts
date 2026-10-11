import type { PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { dec } from "@/lib/money";
import type { Actor } from "@/server/actor";
import { PAID_STATUSES } from "@/server/domain/orderStatus";
import {
  MercadoPagoError,
  createPreference,
  createRefund,
  getPayment,
  mapPaymentStatus,
  mpConfig,
  type MpPayment,
} from "@/server/payments/mercadopago";
import { audit, systemEvent } from "./audit";
import { commitReservedStock, restock, tryCommitWithoutReservation } from "./inventory";
import { lockOrder, stockLines, transitionTx } from "./orderTransitions";
import { appUrl, getMerchantAccessToken, markAccountUnauthorized } from "./paymentAccounts";

/**
 * Pagos simulados (DEMO). Nunca en producción salvo que se habilite explícitamente con
 * DEMO_PAYMENTS_ENABLED=true; todo pago simulado queda marcado isSimulated y se muestra como tal.
 */
export function demoPaymentsEnabled() {
  return process.env.DEMO_PAYMENTS_ENABLED === "true";
}

// ───────────── Inicio del pago ─────────────

export type StartPaymentResult = { kind: "redirect"; url: string } | { kind: "demo" };

export async function startPayment(actor: Actor, orderId: string): Promise<StartPaymentResult> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: actor.userId }, include: { items: true, merchant: { include: { paymentAccount: true } } } });
  if (!order) throw new NotFoundError("Pedido no encontrado");
  if (order.status !== "PENDING_PAYMENT") throw new ConflictError("Este pedido no está pendiente de pago.");
  if (order.reservationExpiresAt && order.reservationExpiresAt < new Date()) throw new ConflictError("La reserva de este pedido venció. Armá el pedido de nuevo.");

  const account = order.merchant.paymentAccount;
  if (!account || account.status === "REVOKED") {
    if (demoPaymentsEnabled()) return { kind: "demo" };
    throw new ConflictError(`${order.merchant.name} todavía no tiene Mercado Pago conectado. No se puede pagar este pedido por ahora.`);
  }

  const { token, liveMode } = await getMerchantAccessToken(order.merchantId);
  const base = appUrl();
  const mpItems = order.items.map((i) => ({
    id: i.sku,
    title: `${i.productName}${i.variantName !== "Única" ? ` (${i.variantName})` : ""}`.slice(0, 250),
    quantity: i.quantity,
    unit_price: Number(i.unitPrice.toFixed(2)),
    currency_id: "ARS" as const,
    ...(i.imageUrl?.startsWith("https://") ? { picture_url: i.imageUrl } : {}),
  }));
  if (order.shippingFee.greaterThan(0)) {
    mpItems.push({ id: "ENVIO", title: "Costo de envío", quantity: 1, unit_price: Number(order.shippingFee.toFixed(2)), currency_id: "ARS" });
  }
  // Control de integridad: lo que se cobra debe coincidir exactamente con el total del pedido.
  const mpTotal = mpItems.reduce((acc, it) => acc.add(dec(it.unit_price).mul(it.quantity)), dec(0));
  if (!mpTotal.equals(order.total)) throw new ConflictError("Inconsistencia en el total del pedido.");

  const fee = mpConfig().platformFeePercent;
  try {
    const pref = await createPreference(
      token,
      {
        items: mpItems,
        payer: { email: order.customerEmail, name: order.contactName },
        external_reference: order.id,
        notification_url: base.startsWith("https://") ? `${base}/api/webhooks/mercadopago?m=${order.merchantId}` : undefined,
        back_urls: {
          success: `${base}/pedidos/${order.id}?mp=success`,
          failure: `${base}/pedidos/${order.id}?mp=failure`,
          pending: `${base}/pedidos/${order.id}?mp=pending`,
        },
        auto_return: base.startsWith("https://") ? "approved" : undefined,
        expires: true,
        expiration_date_to: order.reservationExpiresAt?.toISOString(),
        marketplace_fee: fee > 0 ? Number(order.total.mul(fee).div(100).toFixed(2)) : undefined,
        statement_descriptor: "FEDEXPRESS",
        metadata: { order_id: order.id, merchant_id: order.merchantId },
      },
      `pref-${order.id}`,
    );
    const existing = await prisma.payment.findFirst({ where: { orderId: order.id, provider: "MERCADOPAGO", preferenceId: pref.id } });
    if (!existing) {
      await prisma.payment.create({ data: { orderId: order.id, merchantId: order.merchantId, provider: "MERCADOPAGO", preferenceId: pref.id, amount: order.total, status: "PENDING" } });
    }
    const url = !liveMode && pref.sandbox_init_point ? pref.sandbox_init_point : pref.init_point;
    return { kind: "redirect", url };
  } catch (e) {
    if (e instanceof MercadoPagoError && e.status === 401) await markAccountUnauthorized(order.merchantId);
    if (e instanceof MercadoPagoError) {
      await systemEvent("error", "mercadopago", "No se pudo crear la preferencia de pago", { orderId: order.id, status: e.status }, order.merchantId);
      throw new ConflictError("No pudimos iniciar el pago con Mercado Pago. Probá de nuevo en unos minutos.");
    }
    throw e;
  }
}

// ───────────── Aplicación del resultado (idempotente) ─────────────

export type PaymentResultInput = {
  orderId: string;
  merchantId: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  status: PaymentStatus;
  statusDetail?: string | null;
  amount: Prisma.Decimal;
  currency: string;
  collectorId?: string | null;
  isSimulated: boolean;
  approvedAt?: Date | null;
};

export type PaymentApplyOutcome =
  | "paid"
  | "already_paid"
  | "duplicate_payment"
  | "rejected"
  | "refunded"
  | "refund_pending_no_stock"
  | "amount_mismatch"
  | "recorded";

/**
 * Aplica el estado REAL de un pago (consultado al proveedor) a un pedido.
 * Es seguro ante notificaciones repetidas o concurrentes:
 *  - la fila del pedido se bloquea (FOR UPDATE),
 *  - el stock solo se descuenta si Order.stockCommitted es false,
 *  - los pagos se identifican por (provider, providerPaymentId) único.
 */
export async function applyPaymentResult(input: PaymentResultInput): Promise<PaymentApplyOutcome> {
  let refundAfter = false;
  const outcome = await prisma.$transaction(async (tx): Promise<PaymentApplyOutcome> => {
    const order = await lockOrder(tx, input.orderId);
    if (order.merchantId !== input.merchantId) throw new ForbiddenError("El pago no corresponde al comercio del pedido.");

    // Registrar / actualizar el pago
    let payment = await tx.payment.findUnique({ where: { provider_providerPaymentId: { provider: input.provider, providerPaymentId: input.providerPaymentId } } });
    const paymentData = {
      status: input.status,
      statusDetail: input.statusDetail ?? null,
      amount: input.amount,
      currency: input.currency,
      collectorId: input.collectorId ?? null,
      isSimulated: input.isSimulated,
      approvedAt: input.status === "APPROVED" ? (input.approvedAt ?? new Date()) : undefined,
    };
    if (payment) {
      payment = await tx.payment.update({ where: { id: payment.id }, data: paymentData });
    } else {
      const placeholder = await tx.payment.findFirst({ where: { orderId: order.id, provider: input.provider, providerPaymentId: null } });
      payment = placeholder
        ? await tx.payment.update({ where: { id: placeholder.id }, data: { ...paymentData, providerPaymentId: input.providerPaymentId } })
        : await tx.payment.create({ data: { ...paymentData, orderId: order.id, merchantId: order.merchantId, provider: input.provider, providerPaymentId: input.providerPaymentId } });
    }

    if (input.status === "APPROVED") {
      if (!input.amount.equals(order.total) || input.currency !== order.currency) {
        await systemEvent("error", "payments", "Importe del pago distinto al total del pedido", { orderId: order.id, paid: input.amount.toString(), total: order.total.toString() }, order.merchantId);
        return "amount_mismatch";
      }
      if (order.stockCommitted || PAID_STATUSES.includes(order.status) || order.status === "REFUND_PENDING" || order.status === "REFUNDED") {
        const paidBy = await tx.payment.findFirst({ where: { orderId: order.id, status: "APPROVED", id: { not: payment.id } } });
        if (paidBy) {
          await systemEvent("warn", "payments", "Pago aprobado duplicado para un pedido ya pagado: requiere reembolso", { orderId: order.id, paymentId: input.providerPaymentId }, order.merchantId);
          return "duplicate_payment";
        }
        return "already_paid";
      }
      if (order.stockReserved) {
        await commitReservedStock(tx, order.id, stockLines(order));
      } else {
        const ok = await tryCommitWithoutReservation(tx, order.id, stockLines(order));
        if (!ok) {
          await transitionTx(tx, order, "REFUND_PENDING", "SYSTEM", null, "Pago aprobado después de vencida la reserva y sin stock disponible");
          await systemEvent("warn", "payments", "Pago tardío sin stock: se reembolsará", { orderId: order.id }, order.merchantId);
          refundAfter = true;
          return "refund_pending_no_stock";
        }
      }
      await transitionTx(tx, order, "PAID", "SYSTEM", null, input.isSimulated ? "Pago SIMULADO aprobado (demo)" : "Pago aprobado por Mercado Pago", {
        stockReserved: false,
        stockCommitted: true,
      });
      await tx.delivery.upsert({
        where: { orderId: order.id },
        create: { orderId: order.id, merchantId: order.merchantId, status: "PENDING_ASSIGNMENT", events: { create: { status: "PENDING_ASSIGNMENT", note: "Pedido pagado, esperando preparación" } } },
        update: {},
      });
      return "paid";
    }

    if (input.status === "REJECTED" || input.status === "CANCELLED") {
      // La reserva se mantiene hasta su vencimiento: el cliente puede reintentar con otro medio.
      if (order.status === "PENDING_PAYMENT") {
        await transitionTx(tx, order, "PAYMENT_REJECTED", "SYSTEM", null, `Pago ${input.status === "REJECTED" ? "rechazado" : "cancelado"}${input.statusDetail ? `: ${input.statusDetail}` : ""}`);
      }
      return "rejected";
    }

    if (input.status === "REFUNDED" || input.status === "CHARGED_BACK") {
      if (order.status === "REFUNDED") return "refunded";
      if (PAID_STATUSES.includes(order.status) || order.status === "REFUND_PENDING") {
        if (order.stockCommitted && order.status !== "DELIVERED") await restock(tx, order.id, stockLines(order));
        await transitionTx(tx, order, "REFUNDED", "SYSTEM", null, input.status === "CHARGED_BACK" ? "Contracargo" : "Reembolso confirmado", { stockCommitted: false });
        await tx.refund.updateMany({ where: { paymentId: payment.id, status: "PENDING" }, data: { status: "APPROVED" } });
        await tx.delivery.updateMany({ where: { orderId: order.id, status: { notIn: ["DELIVERED"] } }, data: { status: "CANCELLED" } });
      }
      return "refunded";
    }
    return "recorded";
  });
  if (refundAfter) await requestRefundForOrder(input.orderId, null);
  return outcome;
}

// ───────────── Mercado Pago: sincronización desde notificación o retorno ─────────────

/**
 * Consulta el pago REAL en Mercado Pago con el token del comercio y lo aplica.
 * Se usa tanto desde el webhook como desde la URL de retorno (el id que trae el navegador es solo una pista).
 */
export async function syncMercadoPagoPayment(merchantId: string, paymentId: string): Promise<PaymentApplyOutcome | "ignored"> {
  const { token, providerUserId } = await getMerchantAccessToken(merchantId);
  let p: MpPayment;
  try {
    p = await getPayment(token, paymentId);
  } catch (e) {
    if (e instanceof MercadoPagoError && e.status === 401) await markAccountUnauthorized(merchantId);
    throw e;
  }
  if (!p.external_reference) return "ignored";
  if (p.collector_id && String(p.collector_id) !== providerUserId) {
    await systemEvent("error", "mercadopago", "El pago pertenece a otra cuenta de Mercado Pago", { paymentId }, merchantId);
    return "ignored";
  }
  const order = await prisma.order.findFirst({ where: { id: p.external_reference, merchantId }, select: { id: true } });
  if (!order) {
    await systemEvent("warn", "mercadopago", "Pago sin pedido asociado en este comercio", { paymentId, ref: p.external_reference }, merchantId);
    return "ignored";
  }
  return applyPaymentResult({
    orderId: order.id,
    merchantId,
    provider: "MERCADOPAGO",
    providerPaymentId: String(p.id),
    status: mapPaymentStatus(p.status),
    statusDetail: p.status_detail ?? null,
    amount: dec(String(p.transaction_amount)),
    currency: p.currency_id,
    collectorId: p.collector_id ? String(p.collector_id) : null,
    isSimulated: false,
    approvedAt: p.date_approved ? new Date(p.date_approved) : null,
  });
}

/** Registra la notificación (idempotente por eventKey) y la procesa. */
export async function handleMercadoPagoNotification(params: {
  merchantId: string;
  topic: string;
  resourceId: string;
  requestId: string | null;
  signatureOk: boolean;
  payload: Prisma.InputJsonValue;
}) {
  const eventKey = `mp:${params.topic}:${params.resourceId}:${params.requestId ?? "noreq"}`;
  const existing = await prisma.paymentEvent.findUnique({ where: { eventKey } });
  if (existing?.processedAt) return { duplicate: true as const };
  const ev =
    existing ??
    (await prisma.paymentEvent.create({
      data: { provider: "MERCADOPAGO", eventKey, topic: params.topic, resourceId: params.resourceId, signatureOk: params.signatureOk, payload: params.payload },
    }).catch(async () => prisma.paymentEvent.findUniqueOrThrow({ where: { eventKey } })));
  try {
    const outcome = await syncMercadoPagoPayment(params.merchantId, params.resourceId);
    const pay = await prisma.payment.findUnique({ where: { provider_providerPaymentId: { provider: "MERCADOPAGO", providerPaymentId: params.resourceId } } });
    await prisma.paymentEvent.update({ where: { id: ev.id }, data: { processedAt: new Date(), error: null, paymentId: pay?.id } });
    return { duplicate: false as const, outcome };
  } catch (e) {
    await prisma.paymentEvent.update({ where: { id: ev.id }, data: { error: e instanceof Error ? e.message.slice(0, 500) : "error" } });
    await systemEvent("error", "mercadopago", "Error procesando notificación de pago", { resourceId: params.resourceId }, params.merchantId);
    throw e;
  }
}

// ───────────── Pagos simulados (demo) ─────────────

export async function simulateDemoPayment(actor: Actor, orderId: string, outcome: "approved" | "rejected") {
  if (!demoPaymentsEnabled()) throw new ForbiddenError("Los pagos simulados están deshabilitados.");
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: actor.userId }, include: { merchant: { include: { paymentAccount: true } } } });
  if (!order) throw new NotFoundError("Pedido no encontrado");
  if (order.merchant.paymentAccount && order.merchant.paymentAccount.status !== "REVOKED")
    throw new ForbiddenError("Este comercio cobra con Mercado Pago: no se permiten pagos simulados.");
  if (order.status !== "PENDING_PAYMENT") throw new ConflictError("Este pedido no está pendiente de pago.");
  const n = await prisma.payment.count({ where: { orderId } });
  const result = await applyPaymentResult({
    orderId,
    merchantId: order.merchantId,
    provider: "DEMO",
    providerPaymentId: `demo_${orderId}_${n + 1}`,
    status: outcome === "approved" ? "APPROVED" : "REJECTED",
    statusDetail: "PAGO SIMULADO — no es un cobro real",
    amount: order.total,
    currency: order.currency,
    isSimulated: true,
  });
  await audit({ actorId: actor.userId, action: `payment.demo.${outcome}`, entityType: "Order", entityId: orderId, merchantId: order.merchantId });
  return result;
}

// ───────────── Reembolsos ─────────────

/** Solicita el reembolso del pago aprobado de un pedido en REFUND_PENDING. */
export async function requestRefundForOrder(orderId: string, actorId: string | null) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: { where: { status: "APPROVED" }, include: { refunds: true } } } });
  if (!order || order.status !== "REFUND_PENDING") return;
  const payment = order.payments[0];
  if (!payment) {
    await systemEvent("warn", "payments", "Pedido en reembolso pendiente sin pago aprobado", { orderId }, order.merchantId);
    return;
  }
  if (payment.refunds.some((r) => r.status === "APPROVED")) return;

  if (payment.provider === "DEMO") {
    await prisma.refund.create({ data: { paymentId: payment.id, amount: payment.amount, status: "APPROVED", reason: "Reembolso simulado (demo)", requestedById: actorId } });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
    await prisma.$transaction(async (tx) => {
      const o = await lockOrder(tx, orderId);
      if (o.status === "REFUND_PENDING") await transitionTx(tx, o, "REFUNDED", "SYSTEM", null, "Reembolso SIMULADO (demo)");
    });
    return;
  }

  const refund = payment.refunds.find((r) => r.status === "PENDING") ??
    (await prisma.refund.create({ data: { paymentId: payment.id, amount: payment.amount, status: "PENDING", reason: order.cancelReason, requestedById: actorId } }));
  try {
    const { token } = await getMerchantAccessToken(order.merchantId);
    const r = await createRefund(token, payment.providerPaymentId!, `refund-${refund.id}`);
    await prisma.refund.update({ where: { id: refund.id }, data: { providerRefundId: String(r.id), status: r.status === "approved" ? "APPROVED" : "PENDING" } });
    if (r.status === "approved") {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
      await prisma.$transaction(async (tx) => {
        const o = await lockOrder(tx, orderId);
        if (o.status === "REFUND_PENDING") await transitionTx(tx, o, "REFUNDED", "SYSTEM", null, "Reembolso aprobado por Mercado Pago");
      });
    }
  } catch (e) {
    await systemEvent("error", "mercadopago", "No se pudo solicitar el reembolso; queda pendiente para reintento", { orderId, status: (e as MercadoPagoError).status }, order.merchantId);
  }
}
