import type { Prisma } from "@prisma/client";
import { ConflictError } from "@/lib/errors";

/**
 * Política de stock (documentada en README):
 *  1. Al crear el pedido (PENDING_PAYMENT) se RESERVA el stock: reserved += q, solo si quantity - reserved >= q.
 *  2. Pago aprobado → COMMIT: quantity -= q, reserved -= q (una sola vez: flag Order.stockCommitted).
 *  3. Pago rechazado / pedido vencido o cancelado sin pagar → RELEASE: reserved -= q.
 *  4. Pedido pagado que se cancela/reembolsa → RESTOCK: quantity += q.
 * Cada operación es un UPDATE condicional atómico: dos compras concurrentes nunca venden más que lo disponible.
 * Las filas se procesan ordenadas por variantId para evitar deadlocks.
 */

export type StockLine = { variantId: string; quantity: number; label?: string };

function sorted(lines: StockLine[]) {
  const merged = new Map<string, StockLine>();
  for (const l of lines) {
    const prev = merged.get(l.variantId);
    merged.set(l.variantId, prev ? { ...prev, quantity: prev.quantity + l.quantity } : { ...l });
  }
  return [...merged.values()].sort((a, b) => a.variantId.localeCompare(b.variantId));
}

async function movement(tx: Prisma.TransactionClient, inventoryId: string, type: "RESERVE" | "RELEASE" | "COMMIT" | "RESTOCK", q: number, r: number, orderId: string, actorId?: string | null) {
  await tx.inventoryMovement.create({ data: { inventoryId, type, quantityDelta: q, reservedDelta: r, orderId, actorId: actorId ?? null } });
}

export async function reserveStock(tx: Prisma.TransactionClient, orderId: string, lines: StockLine[], actorId?: string | null) {
  for (const l of sorted(lines)) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Inventory" SET "reserved" = "reserved" + ${l.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${l.variantId} AND "quantity" - "reserved" >= ${l.quantity}
      RETURNING id`;
    if (rows.length === 0) throw new ConflictError(`No hay stock suficiente de ${l.label ?? "un producto"}.`);
    await movement(tx, rows[0].id, "RESERVE", 0, l.quantity, orderId, actorId);
  }
}

export async function releaseStock(tx: Prisma.TransactionClient, orderId: string, lines: StockLine[], actorId?: string | null) {
  for (const l of sorted(lines)) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Inventory" SET "reserved" = GREATEST("reserved" - ${l.quantity}, 0), "updatedAt" = now()
      WHERE "variantId" = ${l.variantId} RETURNING id`;
    if (rows[0]) await movement(tx, rows[0].id, "RELEASE", 0, -l.quantity, orderId, actorId);
  }
}

/** Convierte la reserva en descuento definitivo. */
export async function commitReservedStock(tx: Prisma.TransactionClient, orderId: string, lines: StockLine[]) {
  for (const l of sorted(lines)) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Inventory" SET "quantity" = "quantity" - ${l.quantity}, "reserved" = "reserved" - ${l.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${l.variantId} AND "reserved" >= ${l.quantity} AND "quantity" >= ${l.quantity}
      RETURNING id`;
    if (rows.length === 0) throw new ConflictError("Inconsistencia de reserva de stock");
    await movement(tx, rows[0].id, "COMMIT", -l.quantity, -l.quantity, orderId);
  }
}

/** Descuento directo cuando la reserva ya se había liberado (pago aprobado tardío). Devuelve false si no alcanza. */
export async function tryCommitWithoutReservation(tx: Prisma.TransactionClient, orderId: string, lines: StockLine[]): Promise<boolean> {
  const done: StockLine[] = [];
  for (const l of sorted(lines)) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Inventory" SET "quantity" = "quantity" - ${l.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${l.variantId} AND "quantity" - "reserved" >= ${l.quantity}
      RETURNING id`;
    if (rows.length === 0) {
      // deshacer lo descontado en esta misma operación
      for (const d of done) {
        await tx.$executeRaw`UPDATE "Inventory" SET "quantity" = "quantity" + ${d.quantity} WHERE "variantId" = ${d.variantId}`;
      }
      await tx.inventoryMovement.deleteMany({ where: { orderId, type: "COMMIT", inventory: { variantId: { in: done.map((d) => d.variantId) } } } });
      return false;
    }
    await movement(tx, rows[0].id, "COMMIT", -l.quantity, 0, orderId);
    done.push(l);
  }
  return true;
}

export async function restock(tx: Prisma.TransactionClient, orderId: string, lines: StockLine[], actorId?: string | null) {
  for (const l of sorted(lines)) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Inventory" SET "quantity" = "quantity" + ${l.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${l.variantId} RETURNING id`;
    if (rows[0]) await movement(tx, rows[0].id, "RESTOCK", l.quantity, 0, orderId, actorId);
  }
}
