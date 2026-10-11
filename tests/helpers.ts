import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { dec } from "@/lib/money";
import type { Actor } from "@/server/actor";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function makeUser(email: string, role: "CUSTOMER" | "SUPERADMIN" = "CUSTOMER"): Promise<Actor> {
  const u = await prisma.user.create({ data: { email, name: email.split("@")[0], platformRole: role } });
  return { userId: u.id, email: u.email, name: u.name, platformRole: u.platformRole };
}

export async function makeMerchant(name: string, admin: Actor, opts: { postalCodes?: string[]; fee?: string; freeOver?: string } = {}) {
  const m = await prisma.merchant.create({
    data: {
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-") + "-" + randomUUID().slice(0, 4),
      status: "ACTIVE",
      settings: { create: {} },
      members: { create: { userId: admin.userId, role: "OWNER" } },
      zones: {
        create: {
          name: "Centro",
          postalCodes: opts.postalCodes ?? ["C1000", "1000"],
          fee: dec(opts.fee ?? "500"),
          freeShippingOver: opts.freeOver ? dec(opts.freeOver) : null,
          etaMinMinutes: 20,
          etaMaxMinutes: 40,
        },
      },
    },
  });
  return m;
}

export async function makeProduct(merchantId: string, name: string, price: string, stock: number, sku = `SKU-${randomUUID().slice(0, 6)}`, promo?: string) {
  const p = await prisma.product.create({
    data: {
      merchantId,
      name,
      variants: { create: { merchantId, sku, price: dec(price), promoPrice: promo ? dec(promo) : null, inventory: { create: { quantity: stock } } } },
    },
    include: { variants: { include: { inventory: true } } },
  });
  return { product: p, variant: p.variants[0] };
}

export async function makeAddress(userId: string, postalCode = "C1000") {
  return prisma.address.create({
    data: { userId, street: "Av. Siempreviva", streetNumber: "742", city: "CABA", province: "Buenos Aires", postalCode },
  });
}

export async function inventoryOf(variantId: string) {
  return prisma.inventory.findUniqueOrThrow({ where: { variantId } });
}

export function key() {
  return randomUUID();
}
