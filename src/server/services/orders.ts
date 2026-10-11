import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatARS } from "@/lib/money";
import { isOpenAt } from "@/lib/time";
import { checkoutSchema } from "@/lib/validation";
import { type Actor, assertMerchantAccess } from "@/server/actor";
import { parseOrThrow } from "@/server/parse";
import { rateLimit } from "@/server/rateLimit";
import { audit, systemEvent } from "./audit";
import { releaseStock, reserveStock, restock } from "./inventory";
import { lockOrder, stockLines, transitionTx } from "./orderTransitions";
import { computeTotals, findZone, priceLine } from "./pricing";
import { requestRefundForOrder } from "./payments";

export const DEFAULT_RESERVATION_MINUTES = 30;

/**
 * Checkout: crea el pedido a partir del carrito de UN comercio.
 * Todo se recalcula en el servidor (precios, stock, zona, envío). Se reserva el stock en la misma transacción.
 * Idempotente por idempotencyKey: un doble envío devuelve el mismo pedido.
 */
export async function createOrderFromCart(actor: Actor, input: unknown) {
  const data = parseOrThrow(checkoutSchema, input);
  await rateLimit(`checkout:${actor.userId}`, 10, 60);

  const existing = await prisma.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) {
    if (existing.userId !== actor.userId) throw new ConflictError("Solicitud duplicada inválida.");
    return existing;
  }

  const merchant = await prisma.merchant.findFirst({
    where: { id: data.merchantId, status: "ACTIVE", deletedAt: null },
    include: { zones: { where: { active: true } }, settings: true, hours: true },
  });
  if (!merchant) throw new NotFoundError("El comercio no está disponible.");
  if (merchant.salesPaused) throw new ConflictError(`${merchant.name} pausó temporalmente sus ventas.`);
  if (!isOpenAt(merchant.hours)) throw new ConflictError(`${merchant.name} está cerrado en este momento.`);

  const address = await prisma.address.findFirst({ where: { id: data.addressId, userId: actor.userId, deletedAt: null } });
  if (!address) throw new ValidationError("Elegí una dirección de entrega válida.");
  const zone = findZone(merchant.zones, address.postalCode);
  if (!zone) throw new ValidationError(`${merchant.name} no realiza envíos al código postal ${address.postalCode}.`);

  const reservationMinutes = merchant.settings?.reservationMinutes ?? DEFAULT_RESERVATION_MINUTES;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId_merchantId: { userId: actor.userId, merchantId: merchant.id } },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  inventory: true,
                  product: { select: { id: true, name: true, active: true, deletedAt: true, merchantId: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } },
                },
              },
            },
          },
        },
      });
      if (!cart || cart.items.length === 0) throw new ValidationError("Tu carrito está vacío.");
      if (cart.items.some((i) => i.variant.product.merchantId !== merchant.id)) throw new ConflictError("El carrito contiene productos de otro comercio.");

      const lines = cart.items.map((i) => priceLine(i.variant, i.quantity));
      const problem = lines.find((l) => l.problem);
      if (problem) throw new ConflictError(`${problem.productName}: ${problem.problem}. Revisá tu carrito.`);

      const totals = computeTotals(lines, zone);
      const minOrder = [merchant.settings?.minOrderAmount, zone.minOrderAmount].filter(Boolean) as Prisma.Decimal[];
      for (const m of minOrder) {
        if (totals.subtotal.lessThan(m)) throw new ValidationError(`El pedido mínimo es de ${formatARS(m)}.`);
      }

      const created = await tx.order.create({
        data: {
          userId: actor.userId,
          merchantId: merchant.id,
          status: "PENDING_PAYMENT",
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          shippingFee: totals.shippingFee,
          total: totals.total,
          deliveryZoneName: zone.name,
          etaMinMinutes: zone.etaMinMinutes,
          etaMaxMinutes: zone.etaMaxMinutes,
          shipStreet: address.street,
          shipStreetNumber: address.streetNumber,
          shipApartment: address.apartment,
          shipCity: address.city,
          shipProvince: address.province,
          shipPostalCode: address.postalCode,
          shipInstructions: address.instructions,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          customerEmail: actor.email,
          merchantNameSnapshot: merchant.name,
          idempotencyKey: data.idempotencyKey,
          stockReserved: true,
          reservationExpiresAt: new Date(Date.now() + reservationMinutes * 60_000),
          items: {
            create: lines.map((l) => ({
              variantId: l.variantId,
              productName: l.productName,
              variantName: l.variantName,
              sku: l.sku,
              imageUrl: l.imageUrl,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              lineTotal: l.lineTotal,
            })),
          },
          statusHistory: { create: { toStatus: "PENDING_PAYMENT", actorId: actor.userId, actorType: "CUSTOMER", note: "Pedido creado" } },
        },
      });
      await reserveStock(tx, created.id, lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, label: l.productName })), actor.userId);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return created;
    });
    await audit({ actorId: actor.userId, action: "order.create", entityType: "Order", entityId: order.id, merchantId: merchant.id, metadata: { total: order.total.toString() } });
    return order;
  } catch (e) {
    // Carrera con un doble click: la otra request ya creó el pedido con la misma clave.
    if ((e as { code?: string }).code === "P2002") {
      const dup = await prisma.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (dup && dup.userId === actor.userId) return dup;
    }
    throw e;
  }
}

// ───────────── Consultas ─────────────

const orderDetailInclude = {
  items: true,
  payments: { orderBy: { createdAt: "desc" as const }, include: { refunds: true } },
  statusHistory: { orderBy: { createdAt: "asc" as const }, include: { actor: { select: { name: true, email: true } } } },
  delivery: { include: { courier: { select: { id: true, name: true, phone: true } }, events: { orderBy: { createdAt: "asc" as const } } } },
  merchant: { select: { id: true, name: true, slug: true, phone: true, logoUrl: true, street: true, streetNumber: true, city: true } },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export async function getOrderForCustomer(actor: Actor, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: actor.userId }, include: orderDetailInclude });
  if (!order) throw new NotFoundError("Pedido no encontrado");
  return order;
}

export async function listOrdersForCustomer(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { merchant: { select: { name: true, slug: true, logoUrl: true } }, items: { select: { quantity: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getOrderForMerchant(actor: Actor, merchantId: string, orderId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const order = await prisma.order.findFirst({ where: { id: orderId, merchantId }, include: orderDetailInclude });
  if (!order) throw new NotFoundError("Pedido no encontrado");
  return order;
}

export async function listOrdersForMerchant(
  actor: Actor,
  merchantId: string,
  filter: { status?: OrderStatus[]; from?: Date; to?: Date; take?: number } = {},
) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  return prisma.order.findMany({
    where: {
      merchantId,
      ...(filter.status?.length ? { status: { in: filter.status } } : {}),
      ...(filter.from || filter.to ? { createdAt: { gte: filter.from, lte: filter.to } } : {}),
    },
    include: { items: { select: { quantity: true } }, delivery: { include: { courier: { select: { name: true } } } }, payments: { select: { isSimulated: true, status: true } } },
    orderBy: { createdAt: "desc" },
    take: filter.take ?? 200,
  });
}

// ───────────── Cambios de estado ─────────────

/** Cancelación por el cliente. Sin pagar: libera la reserva. Pagado (si el comercio lo permite y no empezó a prepararlo): reembolso. */
export async function cancelOrderByCustomer(actor: Actor, orderId: string, reason?: string) {
  let needsRefund = false;
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.userId !== actor.userId) throw new NotFoundError("Pedido no encontrado");
    if (order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_REJECTED") {
      if (order.stockReserved) await releaseStock(tx, order.id, stockLines(order), actor.userId);
      await transitionTx(tx, order, "CANCELLED", "CUSTOMER", actor.userId, reason ?? "Cancelado por el cliente", { stockReserved: false, cancelReason: reason ?? null });
    } else if (order.status === "PAID") {
      const settings = await tx.merchantSettings.findUnique({ where: { merchantId: order.merchantId } });
      if (settings && !settings.allowCustomerCancelPaid) throw new ForbiddenError("Este comercio no permite cancelar pedidos ya pagados. Contactalo.");
      if (order.stockCommitted) await restock(tx, order.id, stockLines(order), actor.userId);
      await transitionTx(tx, order, "REFUND_PENDING", "CUSTOMER", actor.userId, reason ?? "Cancelado por el cliente", { stockCommitted: false, cancelReason: reason ?? null });
      needsRefund = true;
    } else {
      throw new ConflictError("El pedido ya no se puede cancelar: el comercio lo está preparando o ya fue enviado.");
    }
  });
  await audit({ actorId: actor.userId, action: "order.cancel.customer", entityType: "Order", entityId: orderId });
  if (needsRefund) await requestRefundForOrder(orderId, actor.userId);
}

/** Reintentar el pago de un pedido rechazado: vuelve a reservar stock. */
export async function retryOrderPayment(actor: Actor, orderId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.userId !== actor.userId) throw new NotFoundError("Pedido no encontrado");
    if (order.status !== "PAYMENT_REJECTED") throw new ConflictError("Este pedido no admite reintentar el pago.");
    const settings = await tx.merchantSettings.findUnique({ where: { merchantId: order.merchantId } });
    if (!order.stockReserved) await reserveStock(tx, order.id, stockLines(order), actor.userId);
    await transitionTx(tx, order, "PENDING_PAYMENT", "CUSTOMER", actor.userId, "Reintento de pago", {
      stockReserved: true,
      reservationExpiresAt: new Date(Date.now() + (settings?.reservationMinutes ?? DEFAULT_RESERVATION_MINUTES) * 60_000),
    });
  });
}

const MERCHANT_SIMPLE: OrderStatus[] = ["PREPARING", "READY", "DELIVERED"];

/** Cambios de estado operativos del comercio (preparación, listo, entregado en local, cancelación). */
export async function updateOrderStatusByMerchant(actor: Actor, merchantId: string, orderId: string, to: OrderStatus, note?: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const actorType = actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "MERCHANT";
  let needsRefund = false;
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.merchantId !== merchantId) throw new NotFoundError("Pedido no encontrado");
    if (to === "CANCELLED") {
      if (order.stockReserved) await releaseStock(tx, order.id, stockLines(order), actor.userId);
      await transitionTx(tx, order, "CANCELLED", actorType, actor.userId, note ?? "Cancelado por el comercio", { stockReserved: false, cancelReason: note ?? null });
    } else if (to === "REFUND_PENDING") {
      // Un pedido ya entregado no devuelve mercadería al stock automáticamente.
      if (order.stockCommitted && order.status !== "DELIVERED") await restock(tx, order.id, stockLines(order), actor.userId);
      await transitionTx(tx, order, "REFUND_PENDING", actorType, actor.userId, note ?? "Cancelado por el comercio", { stockCommitted: false, cancelReason: note ?? null });
      await tx.delivery.updateMany({ where: { orderId, status: { notIn: ["DELIVERED"] } }, data: { status: "CANCELLED" } });
      needsRefund = true;
    } else if (MERCHANT_SIMPLE.includes(to) || to === "ON_THE_WAY") {
      if (to === "DELIVERED" && order.status === "ON_THE_WAY") {
        await tx.delivery.updateMany({ where: { orderId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
      }
      if (to === "ON_THE_WAY") {
        await tx.delivery.updateMany({ where: { orderId }, data: { status: "PICKED_UP", pickedUpAt: new Date() } });
      }
      await transitionTx(tx, order, to, actorType, actor.userId, note);
    } else {
      throw new ConflictError("Transición no permitida desde el panel.");
    }
  });
  await audit({ actorId: actor.userId, action: `order.status.${to.toLowerCase()}`, entityType: "Order", entityId: orderId, merchantId });
  if (needsRefund) await requestRefundForOrder(orderId, actor.userId);
}

/**
 * Vence pedidos pendientes de pago cuya reserva expiró y libera el stock.
 * Lo ejecuta el cron (/api/cron/expire-orders) y también se invoca de forma oportunista.
 */
export async function expireStaleOrders(now = new Date(), limit = 100) {
  const stale = await prisma.order.findMany({
    where: { status: { in: ["PENDING_PAYMENT", "PAYMENT_REJECTED"] }, reservationExpiresAt: { lt: now } },
    select: { id: true },
    take: limit,
  });
  let expired = 0;
  for (const { id } of stale) {
    try {
      await prisma.$transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        if (!["PENDING_PAYMENT", "PAYMENT_REJECTED"].includes(order.status)) return;
        if (!order.reservationExpiresAt || order.reservationExpiresAt >= now) return;
        if (order.stockReserved) await releaseStock(tx, order.id, stockLines(order));
        await transitionTx(tx, order, "CANCELLED", "SYSTEM", null, "Reserva vencida sin pago", { stockReserved: false, cancelReason: "Pago no recibido a tiempo" });
        expired++;
      });
    } catch (e) {
      await systemEvent("error", "cron", "No se pudo vencer un pedido", { orderId: id, error: String(e) });
    }
  }
  return { expired };
}
