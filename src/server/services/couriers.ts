import type { DeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { courierSchema } from "@/lib/validation";
import { type Actor, assertMerchantAccess } from "@/server/actor";
import { parseOrThrow } from "@/server/parse";
import { audit } from "./audit";
import { lockOrder, transitionTx } from "./orderTransitions";

/** Vincula los perfiles de repartidor dados de alta con este email al usuario que inicia sesión. */
export async function linkCouriersToUser(userId: string, email: string) {
  await prisma.courier.updateMany({ where: { email: email.toLowerCase(), userId: null }, data: { userId } });
}

// ───────────── Gestión por el comercio ─────────────

export async function listCouriers(actor: Actor, merchantId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  return prisma.courier.findMany({
    where: { merchantId },
    include: { _count: { select: { deliveries: { where: { status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] } } } } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function saveCourier(actor: Actor, merchantId: string, courierId: string | null, input: unknown) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const data = parseOrThrow(courierSchema, input);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  try {
    let c;
    if (courierId) {
      const r = await prisma.courier.updateMany({ where: { id: courierId, merchantId }, data: { ...data, userId: user?.id ?? null } });
      if (r.count === 0) throw new NotFoundError();
      c = await prisma.courier.findUniqueOrThrow({ where: { id: courierId } });
    } else {
      c = await prisma.courier.create({ data: { ...data, merchantId, userId: user?.id ?? null } });
    }
    await audit({ actorId: actor.userId, action: courierId ? "courier.update" : "courier.create", entityType: "Courier", entityId: c.id, merchantId });
    return c;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ConflictError("Ya existe un repartidor con ese email en tu comercio.");
    throw e;
  }
}

export async function setCourierActive(actor: Actor, merchantId: string, courierId: string, active: boolean) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const r = await prisma.courier.updateMany({ where: { id: courierId, merchantId }, data: { active } });
  if (r.count === 0) throw new NotFoundError();
  await audit({ actorId: actor.userId, action: active ? "courier.activate" : "courier.deactivate", entityType: "Courier", entityId: courierId, merchantId });
}

/** Asigna un repartidor DEL MISMO comercio a un pedido listo. */
export async function assignCourier(actor: Actor, merchantId: string, orderId: string, courierId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const courier = await prisma.courier.findFirst({ where: { id: courierId, merchantId, active: true } });
  if (!courier) throw new NotFoundError("Repartidor no encontrado");
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.merchantId !== merchantId) throw new NotFoundError("Pedido no encontrado");
    if (order.status !== "READY") throw new ConflictError("Solo se puede asignar repartidor a pedidos listos para entregar.");
    const delivery = await tx.delivery.upsert({
      where: { orderId },
      create: { orderId, merchantId, courierId, status: "ASSIGNED", assignedAt: new Date() },
      update: { courierId, status: "ASSIGNED", assignedAt: new Date(), acceptedAt: null },
    });
    await tx.deliveryEvent.create({ data: { deliveryId: delivery.id, status: "ASSIGNED", actorId: actor.userId, note: `Asignado a ${courier.name}` } });
    await transitionTx(tx, order, "COURIER_ASSIGNED", "MERCHANT", actor.userId, `Repartidor: ${courier.name}`);
  });
  await audit({ actorId: actor.userId, action: "delivery.assign", entityType: "Order", entityId: orderId, merchantId, metadata: { courierId } });
}

export async function unassignCourier(actor: Actor, merchantId: string, orderId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.merchantId !== merchantId) throw new NotFoundError("Pedido no encontrado");
    const d = await tx.delivery.findUnique({ where: { orderId } });
    if (!d) throw new NotFoundError();
    await tx.delivery.update({ where: { id: d.id }, data: { courierId: null, status: "PENDING_ASSIGNMENT" } });
    await tx.deliveryEvent.create({ data: { deliveryId: d.id, status: "PENDING_ASSIGNMENT", actorId: actor.userId, note: "Repartidor desasignado" } });
    await transitionTx(tx, order, "READY", "MERCHANT", actor.userId, "Repartidor desasignado");
  });
}

// ───────────── Acciones del repartidor ─────────────

/** Entregas del repartidor: solo las asignadas a SUS perfiles. */
export async function listDeliveriesForCourier(actor: Actor, opts: { history?: boolean } = {}) {
  return prisma.delivery.findMany({
    where: {
      courier: { userId: actor.userId },
      status: opts.history ? { in: ["DELIVERED", "FAILED", "CANCELLED"] } : { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] },
    },
    include: {
      order: { include: { items: true, merchant: { select: { name: true, phone: true, street: true, streetNumber: true, city: true } } } },
      courier: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

type CourierAction = "accept" | "pickup" | "deliver" | "fail";

const NEXT: Record<CourierAction, { from: DeliveryStatus[]; to: DeliveryStatus }> = {
  accept: { from: ["ASSIGNED"], to: "ACCEPTED" },
  pickup: { from: ["ASSIGNED", "ACCEPTED"], to: "PICKED_UP" },
  deliver: { from: ["PICKED_UP"], to: "DELIVERED" },
  fail: { from: ["ACCEPTED", "PICKED_UP"], to: "FAILED" },
};

export async function courierUpdateDelivery(actor: Actor, deliveryId: string, action: CourierAction, note?: string) {
  const delivery = await prisma.delivery.findFirst({ where: { id: deliveryId }, include: { courier: true } });
  // El mismo error para "no existe" y "no es tuya": no se filtra la existencia de entregas ajenas.
  if (!delivery || !delivery.courier || delivery.courier.userId !== actor.userId || !delivery.courier.active) throw new NotFoundError("Entrega no encontrada");
  const step = NEXT[action];
  if (!step.from.includes(delivery.status)) throw new ConflictError("Esa acción no corresponde al estado actual de la entrega.");
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, delivery.orderId);
    const now = new Date();
    await tx.delivery.update({
      where: { id: deliveryId },
      data: {
        status: step.to,
        ...(step.to === "ACCEPTED" ? { acceptedAt: now } : {}),
        ...(step.to === "PICKED_UP" ? { pickedUpAt: now } : {}),
        ...(step.to === "DELIVERED" ? { deliveredAt: now } : {}),
        ...(note ? { notes: note.slice(0, 300) } : {}),
      },
    });
    await tx.deliveryEvent.create({ data: { deliveryId, status: step.to, actorId: actor.userId, note: note?.slice(0, 300) ?? null } });
    if (step.to === "PICKED_UP") await transitionTx(tx, order, "ON_THE_WAY", "COURIER", actor.userId, "Retirado por el repartidor");
    if (step.to === "DELIVERED") await transitionTx(tx, order, "DELIVERED", "COURIER", actor.userId, "Entregado por el repartidor");
    if (step.to === "FAILED") {
      // Entrega fallida: vuelve al comercio para reasignar
      if (order.status === "ON_THE_WAY" || order.status === "COURIER_ASSIGNED") {
        await transitionTx(tx, order, "READY", "COURIER", actor.userId, `Entrega fallida${note ? `: ${note.slice(0, 200)}` : ""}`);
      }
    }
  });
  await audit({ actorId: actor.userId, action: `delivery.${action}`, entityType: "Delivery", entityId: deliveryId, merchantId: delivery.merchantId });
}

export async function assertIsCourier(actor: Actor) {
  const c = await prisma.courier.findFirst({ where: { userId: actor.userId, active: true } });
  if (!c) throw new ForbiddenError("Tu usuario no está registrado como repartidor.");
  return c;
}
