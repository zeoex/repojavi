// Reglas de autorización puras (sin dependencias de Next) para poder probarlas directamente.
import { prisma } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { PlatformRole } from "@prisma/client";

export type Actor = {
  userId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  platformRole: PlatformRole;
};

export function isSuperadmin(actor: Actor | null | undefined) {
  return actor?.platformRole === "SUPERADMIN";
}

export function assertSuperadmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) throw new UnauthorizedError();
  if (actor.platformRole !== "SUPERADMIN") throw new ForbiddenError();
}

/** IDs de comercios que administra el usuario (no eliminados). */
export async function merchantIdsFor(userId: string): Promise<string[]> {
  const rows = await prisma.merchantUser.findMany({
    where: { userId, merchant: { deletedAt: null } },
    select: { merchantId: true },
  });
  return rows.map((r) => r.merchantId);
}

/**
 * Verifica que el actor administre el comercio. El superadmin puede supervisar
 * cualquier comercio solo si allowSuperadmin = true (operaciones de supervisión).
 */
export async function assertMerchantAccess(
  actor: Actor | null | undefined,
  merchantId: string,
  opts: { allowSuperadmin?: boolean } = {},
): Promise<void> {
  if (!actor) throw new UnauthorizedError();
  if (opts.allowSuperadmin !== false && actor.platformRole === "SUPERADMIN") return;
  const m = await prisma.merchantUser.findFirst({
    where: { userId: actor.userId, merchantId, merchant: { deletedAt: null } },
    select: { id: true },
  });
  if (!m) throw new ForbiddenError();
}

/** Perfiles de repartidor activos del usuario. */
export async function courierFor(userId: string) {
  return prisma.courier.findMany({
    where: { userId, active: true, merchant: { deletedAt: null } },
    select: { id: true, merchantId: true, name: true },
  });
}
