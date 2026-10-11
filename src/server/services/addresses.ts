import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { addressSchema } from "@/lib/validation";
import type { Actor } from "@/server/actor";
import { parseOrThrow } from "@/server/parse";

export async function listAddresses(userId: string) {
  return prisma.address.findMany({ where: { userId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
}

export async function saveAddress(actor: Actor, addressId: string | null, input: unknown) {
  const data = parseOrThrow(addressSchema, input);
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.address.updateMany({ where: { userId: actor.userId }, data: { isDefault: false } });
    if (addressId) {
      const r = await tx.address.updateMany({ where: { id: addressId, userId: actor.userId, deletedAt: null }, data });
      if (r.count === 0) throw new NotFoundError();
      return tx.address.findUniqueOrThrow({ where: { id: addressId } });
    }
    const count = await tx.address.count({ where: { userId: actor.userId, deletedAt: null } });
    return tx.address.create({ data: { ...data, isDefault: data.isDefault || count === 0, userId: actor.userId } });
  });
}

export async function deleteAddress(actor: Actor, addressId: string) {
  const r = await prisma.address.updateMany({ where: { id: addressId, userId: actor.userId, deletedAt: null }, data: { deletedAt: new Date(), isDefault: false } });
  if (r.count === 0) throw new NotFoundError();
}
