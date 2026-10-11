import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { UnauthorizedError } from "@/lib/errors";

export type { Actor } from "@/server/actor";
export { assertMerchantAccess, assertSuperadmin, merchantIdsFor, courierFor } from "@/server/actor";

/** Usuario autenticado y ACTIVO, leído de la base (no del token) en cada request. */
export async function getActor(): Promise<Actor | null> {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return null;
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { id: true, email: true, name: true, image: true, platformRole: true, status: true, deletedAt: true },
  });
  if (!user || user.status !== "ACTIVE" || user.deletedAt) return null;
  return { userId: user.id, email: user.email, name: user.name, image: user.image, platformRole: user.platformRole };
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new UnauthorizedError();
  return actor;
}
