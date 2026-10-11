import type { Order, OrderStatus, Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { canTransition, type TransitionActor } from "@/server/domain/orderStatus";

/** Bloquea la fila del pedido (SELECT … FOR UPDATE) y la devuelve. Serializa webhooks, cron y acciones concurrentes. */
export async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new NotFoundError("Pedido no encontrado");
  return order;
}

export async function transitionTx(
  tx: Prisma.TransactionClient,
  order: Pick<Order, "id" | "status">,
  to: OrderStatus,
  actorType: TransitionActor,
  actorId: string | null,
  note?: string,
  extra: Prisma.OrderUpdateInput = {},
) {
  if (!canTransition(order.status, to, actorType)) {
    throw new ConflictError(`No se puede pasar el pedido de "${order.status}" a "${to}".`);
  }
  const now = new Date();
  const stamps: Prisma.OrderUpdateInput = {};
  if (to === "PAID") stamps.paidAt = now;
  if (to === "DELIVERED") stamps.deliveredAt = now;
  if (to === "CANCELLED") stamps.cancelledAt = now;
  const updated = await tx.order.update({ where: { id: order.id }, data: { status: to, ...stamps, ...extra } });
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: to,
      actorId,
      actorType: actorType === "SYSTEM" ? "SYSTEM" : actorType,
      note: note ?? null,
    },
  });
  order.status = to;
  return updated;
}

export function stockLines(order: { items: { variantId: string; quantity: number; productName: string }[] }) {
  return order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, label: i.productName }));
}
