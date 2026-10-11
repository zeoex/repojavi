import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ZERO } from "@/lib/money";
import { type Actor, assertMerchantAccess, assertSuperadmin } from "@/server/actor";
import { ACTIVE_STATUSES } from "@/server/domain/orderStatus";

export type ReportFilter = { from?: Date; to?: Date; merchantId?: string; status?: OrderStatus };

function orderWhere(f: ReportFilter): Prisma.OrderWhereInput {
  return {
    ...(f.merchantId ? { merchantId: f.merchantId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };
}

/**
 * Métricas financieras. Definiciones (también en README):
 *  - Ventas brutas: suma del total de pedidos con pago confirmado (paidAt), aunque luego se reembolsen.
 *    Es dinero cobrado POR LOS COMERCIOS, no ingreso de la plataforma.
 *  - Cobrado real: pagos APROBADOS/REEMBOLSADOS de Mercado Pago (no simulados).
 *  - Simulado: pagos de demostración (no es dinero real).
 *  - Reembolsos: reembolsos aprobados.
 *  - Envíos: costo de envío incluido en las ventas brutas.
 */
async function financials(where: Prisma.OrderWhereInput) {
  const paidWhere = { ...where, paidAt: { not: null } };
  const [gross, collected, simulated, refunds] = await Promise.all([
    prisma.order.aggregate({ where: paidWhere, _sum: { total: true, shippingFee: true }, _count: true }),
    prisma.payment.aggregate({ where: { order: where, isSimulated: false, status: { in: ["APPROVED", "REFUNDED", "PARTIALLY_REFUNDED"] } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { order: where, isSimulated: true, status: { in: ["APPROVED", "REFUNDED"] } }, _sum: { amount: true } }),
    prisma.refund.aggregate({ where: { status: "APPROVED", payment: { order: where } }, _sum: { amount: true } }),
  ]);
  return {
    paidOrders: gross._count,
    grossSales: gross._sum.total ?? ZERO,
    shipping: gross._sum.shippingFee ?? ZERO,
    collectedReal: collected._sum.amount ?? ZERO,
    collectedSimulated: simulated._sum.amount ?? ZERO,
    refunds: refunds._sum.amount ?? ZERO,
  };
}

export async function platformDashboard(actor: Actor, f: ReportFilter) {
  assertSuperadmin(actor);
  const where = orderWhere(f);
  const [merchantsByStatus, deletedMerchants, customers, totalOrders, pendingPayment, byStatus, fin, salesByMerchant, pendingDeliveries, paymentErrors, recent] = await Promise.all([
    prisma.merchant.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    prisma.merchant.count({ where: { deletedAt: { not: null } } }),
    prisma.user.count({ where: { platformRole: "CUSTOMER", deletedAt: null, memberships: { none: {} } } }),
    prisma.order.count({ where }),
    prisma.order.count({ where: { ...where, status: "PENDING_PAYMENT" } }),
    prisma.order.groupBy({ by: ["status"], where, _count: true }),
    financials(where),
    prisma.order.groupBy({ by: ["merchantId"], where: { ...where, paidAt: { not: null } }, _sum: { total: true }, _count: true, orderBy: { _sum: { total: "desc" } } }),
    prisma.delivery.count({ where: { status: { in: ["PENDING_ASSIGNMENT", "ASSIGNED", "ACCEPTED", "PICKED_UP"] }, ...(f.merchantId ? { merchantId: f.merchantId } : {}) } }),
    prisma.systemEvent.findMany({ where: { level: "error", source: { in: ["mercadopago", "payments"] }, ...(f.merchantId ? { merchantId: f.merchantId } : {}) }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.auditLog.findMany({ where: f.merchantId ? { merchantId: f.merchantId } : {}, orderBy: { createdAt: "desc" }, take: 15, include: { actor: { select: { email: true } } } }),
  ]);
  const merchantNames = await prisma.merchant.findMany({ where: { id: { in: salesByMerchant.map((s) => s.merchantId) } }, select: { id: true, name: true } });
  const nameOf = new Map(merchantNames.map((m) => [m.id, m.name]));
  const count = (s: string) => merchantsByStatus.find((m) => m.status === s)?._count ?? 0;
  return {
    merchants: { total: merchantsByStatus.reduce((a, m) => a + m._count, 0), active: count("ACTIVE"), suspended: count("SUSPENDED"), pending: count("PENDING"), deleted: deletedMerchants },
    customers,
    orders: { total: totalOrders, pendingPayment, paid: fin.paidOrders, byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])) as Partial<Record<OrderStatus, number>> },
    financials: fin,
    salesByMerchant: salesByMerchant.map((s) => ({ merchantId: s.merchantId, name: nameOf.get(s.merchantId) ?? s.merchantId, total: s._sum.total ?? ZERO, orders: s._count })),
    pendingDeliveries,
    paymentErrors,
    recent,
  };
}

export async function merchantDashboard(actor: Actor, merchantId: string, f: Omit<ReportFilter, "merchantId"> = {}) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const where = orderWhere({ ...f, merchantId });
  const [fin, byStatus, inDelivery, topRaw, variants] = await Promise.all([
    financials(where),
    prisma.order.groupBy({ by: ["status"], where, _count: true }),
    prisma.delivery.count({ where: { merchantId, status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] } } }),
    prisma.orderItem.groupBy({
      by: ["productName"],
      where: { order: { ...where, paidAt: { not: null }, status: { notIn: ["REFUNDED", "REFUND_PENDING"] } } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.productVariant.findMany({
      where: { merchantId, deletedAt: null, product: { deletedAt: null } },
      include: { inventory: true, product: { select: { id: true, name: true, active: true } } },
    }),
  ]);
  const status = Object.fromEntries(byStatus.map((b) => [b.status, b._count])) as Partial<Record<OrderStatus, number>>;
  const avail = (v: (typeof variants)[number]) => (v.inventory ? v.inventory.quantity - v.inventory.reserved : 0);
  const outOfStock = variants.filter((v) => avail(v) <= 0);
  const lowStock = variants.filter((v) => avail(v) > 0 && v.inventory?.minStock != null && avail(v) <= v.inventory.minStock);
  return {
    financials: fin,
    status,
    pendingPayment: status.PENDING_PAYMENT ?? 0,
    toPrepare: status.PAID ?? 0,
    preparing: status.PREPARING ?? 0,
    active: ACTIVE_STATUSES.reduce((a, s) => a + (status[s] ?? 0), 0),
    inDelivery,
    topProducts: topRaw.map((t) => ({ name: t.productName, quantity: t._sum.quantity ?? 0, total: t._sum.lineTotal ?? ZERO })),
    outOfStock,
    lowStock,
  };
}

/** CSV de pedidos del comercio (formato regional: separador ";" y coma decimal). */
export async function exportMerchantOrdersCsv(actor: Actor, merchantId: string, f: Omit<ReportFilter, "merchantId"> = {}) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const orders = await prisma.order.findMany({
    where: orderWhere({ ...f, merchantId }),
    include: { payments: { where: { status: "APPROVED" }, select: { provider: true, providerPaymentId: true, isSimulated: true } }, items: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    // Evita inyección de fórmulas en planillas de cálculo
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const num = (d: Prisma.Decimal) => d.toFixed(2).replace(".", ",");
  const header = ["Pedido", "Fecha", "Estado", "Cliente", "Email", "Teléfono", "Dirección", "CP", "Productos", "Subtotal", "Envío", "Total", "Pago", "Id de pago", "Simulado"];
  const rows = orders.map((o) => [
    o.number,
    o.createdAt.toISOString(),
    o.status,
    o.contactName,
    o.customerEmail,
    o.contactPhone,
    `${o.shipStreet} ${o.shipStreetNumber}${o.shipApartment ? ` ${o.shipApartment}` : ""}, ${o.shipCity}`,
    o.shipPostalCode,
    o.items.map((i) => `${i.quantity}x ${i.productName}`).join(" | "),
    num(o.subtotal),
    num(o.shippingFee),
    num(o.total),
    o.payments[0]?.provider ?? "",
    o.payments[0]?.providerPaymentId ?? "",
    o.payments[0]?.isSimulated ? "SI" : "",
  ]);
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
}
