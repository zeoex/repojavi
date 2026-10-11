import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { slugify } from "@/lib/slug";
import { dec } from "@/lib/money";
import { isOpenAt } from "@/lib/time";
import { merchantCreateSchema, merchantProfileSchema, hoursSchema, zoneSchema } from "@/lib/validation";
import { type Actor, assertMerchantAccess, assertSuperadmin } from "@/server/actor";
import { parseOrThrow } from "@/server/parse";
import { audit } from "./audit";
import type { MerchantStatus } from "@prisma/client";

async function uniqueSlug(name: string) {
  const base = slugify(name) || "comercio";
  let slug = base;
  for (let i = 2; await prisma.merchant.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

/** Busca o crea (sin cuenta) un usuario por email. Al iniciar sesión con Google se vincula. */
async function ensureUserByEmail(email: string) {
  const e = email.toLowerCase();
  return (
    (await prisma.user.findUnique({ where: { email: e } })) ??
    (await prisma.user.create({ data: { email: e, name: e.split("@")[0], customerProfile: { create: {} } } }))
  );
}

// ───────────── Superadmin ─────────────

export async function createMerchant(actor: Actor, input: unknown) {
  assertSuperadmin(actor);
  const data = parseOrThrow(merchantCreateSchema, input);
  const admin = await ensureUserByEmail(data.adminEmail);
  const merchant = await prisma.merchant.create({
    data: {
      name: data.name,
      slug: await uniqueSlug(data.name),
      businessType: data.businessType,
      description: data.description,
      phone: data.phone,
      email: data.email,
      status: "ACTIVE",
      settings: { create: {} },
      members: { create: { userId: admin.id, role: "OWNER" } },
    },
  });
  await audit({ actorId: actor.userId, action: "merchant.create", entityType: "Merchant", entityId: merchant.id, merchantId: merchant.id, metadata: { adminEmail: data.adminEmail } });
  return merchant;
}

export async function setMerchantStatus(actor: Actor, merchantId: string, status: MerchantStatus) {
  assertSuperadmin(actor);
  const m = await prisma.merchant.update({ where: { id: merchantId }, data: { status } });
  await audit({ actorId: actor.userId, action: `merchant.status.${status.toLowerCase()}`, entityType: "Merchant", entityId: merchantId, merchantId });
  return m;
}

export async function setMerchantFeatured(actor: Actor, merchantId: string, featured: boolean) {
  assertSuperadmin(actor);
  await prisma.merchant.update({ where: { id: merchantId }, data: { featured } });
  await audit({ actorId: actor.userId, action: "merchant.featured", entityType: "Merchant", entityId: merchantId, merchantId, metadata: { featured } });
}

/** Eliminación lógica: el comercio desaparece del portal pero se conserva el historial. */
export async function softDeleteMerchant(actor: Actor, merchantId: string) {
  assertSuperadmin(actor);
  await prisma.merchant.update({ where: { id: merchantId }, data: { deletedAt: new Date(), status: "SUSPENDED" } });
  await audit({ actorId: actor.userId, action: "merchant.delete", entityType: "Merchant", entityId: merchantId, merchantId });
}

export async function addMerchantAdmin(actor: Actor, merchantId: string, email: string) {
  assertSuperadmin(actor);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError("Email inválido");
  const merchant = await prisma.merchant.findFirst({ where: { id: merchantId, deletedAt: null } });
  if (!merchant) throw new NotFoundError();
  const user = await ensureUserByEmail(email);
  await prisma.merchantUser.upsert({
    where: { merchantId_userId: { merchantId, userId: user.id } },
    create: { merchantId, userId: user.id, role: "ADMIN" },
    update: {},
  });
  await audit({ actorId: actor.userId, action: "merchant.admin.add", entityType: "MerchantUser", entityId: user.id, merchantId, metadata: { email } });
}

export async function removeMerchantAdmin(actor: Actor, merchantId: string, userId: string) {
  assertSuperadmin(actor);
  await prisma.merchantUser.deleteMany({ where: { merchantId, userId } });
  await audit({ actorId: actor.userId, action: "merchant.admin.remove", entityType: "MerchantUser", entityId: userId, merchantId });
}

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED") {
  assertSuperadmin(actor);
  if (userId === actor.userId) throw new ConflictError("No podés suspender tu propia cuenta.");
  await prisma.user.update({ where: { id: userId }, data: { status } });
  await audit({ actorId: actor.userId, action: `user.status.${status.toLowerCase()}`, entityType: "User", entityId: userId });
}

// ───────────── Administrador de comercio ─────────────

export async function updateMerchantProfile(actor: Actor, merchantId: string, input: unknown) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const data = parseOrThrow(merchantProfileSchema, input);
  const m = await prisma.merchant.update({ where: { id: merchantId }, data });
  await audit({ actorId: actor.userId, action: "merchant.profile.update", entityType: "Merchant", entityId: merchantId, merchantId });
  return m;
}

export async function setSalesPaused(actor: Actor, merchantId: string, paused: boolean) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  await prisma.merchant.update({ where: { id: merchantId }, data: { salesPaused: paused } });
  await audit({ actorId: actor.userId, action: paused ? "merchant.sales.pause" : "merchant.sales.resume", entityType: "Merchant", entityId: merchantId, merchantId });
}

export async function updateMerchantSettings(
  actor: Actor,
  merchantId: string,
  input: { minOrderAmount: string; reservationMinutes: number; allowCustomerCancelPaid: boolean },
) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const minutes = Math.trunc(Number(input.reservationMinutes));
  if (!Number.isFinite(minutes) || minutes < 10 || minutes > 1440) throw new ValidationError("La reserva debe durar entre 10 y 1440 minutos");
  if (!/^\d{1,10}([.,]\d{1,2})?$/.test(input.minOrderAmount.trim())) throw new ValidationError("Monto mínimo inválido");
  await prisma.merchantSettings.upsert({
    where: { merchantId },
    create: { merchantId, minOrderAmount: dec(input.minOrderAmount.replace(",", ".")), reservationMinutes: minutes, allowCustomerCancelPaid: input.allowCustomerCancelPaid },
    update: { minOrderAmount: dec(input.minOrderAmount.replace(",", ".")), reservationMinutes: minutes, allowCustomerCancelPaid: input.allowCustomerCancelPaid },
  });
  await audit({ actorId: actor.userId, action: "merchant.settings.update", entityType: "MerchantSettings", entityId: merchantId, merchantId });
}

export async function replaceMerchantHours(actor: Actor, merchantId: string, input: unknown) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const hours = parseOrThrow(hoursSchema, input);
  await prisma.$transaction([
    prisma.merchantHours.deleteMany({ where: { merchantId } }),
    prisma.merchantHours.createMany({ data: hours.map((h) => ({ ...h, merchantId })) }),
  ]);
  await audit({ actorId: actor.userId, action: "merchant.hours.update", entityType: "Merchant", entityId: merchantId, merchantId });
}

export async function upsertZone(actor: Actor, merchantId: string, zoneId: string | null, input: unknown) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const z = parseOrThrow(zoneSchema, input);
  const data = {
    name: z.name,
    postalCodes: z.postalCodes,
    fee: dec(z.fee),
    freeShippingOver: z.freeShippingOver ? dec(z.freeShippingOver) : null,
    minOrderAmount: dec(z.minOrderAmount),
    etaMinMinutes: z.etaMinMinutes,
    etaMaxMinutes: z.etaMaxMinutes,
    active: z.active,
  };
  let zone;
  if (zoneId) {
    // updateMany con merchantId impide editar zonas de otro comercio aunque se manipule el id
    const r = await prisma.deliveryZone.updateMany({ where: { id: zoneId, merchantId }, data });
    if (r.count === 0) throw new NotFoundError();
    zone = await prisma.deliveryZone.findUniqueOrThrow({ where: { id: zoneId } });
  } else {
    zone = await prisma.deliveryZone.create({ data: { ...data, merchantId } });
  }
  await audit({ actorId: actor.userId, action: zoneId ? "zone.update" : "zone.create", entityType: "DeliveryZone", entityId: zone.id, merchantId });
  return zone;
}

export async function deleteZone(actor: Actor, merchantId: string, zoneId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const r = await prisma.deliveryZone.deleteMany({ where: { id: zoneId, merchantId } });
  if (r.count === 0) throw new NotFoundError();
  await audit({ actorId: actor.userId, action: "zone.delete", entityType: "DeliveryZone", entityId: zoneId, merchantId });
}

// ───────────── Consultas públicas ─────────────

export const PUBLIC_MERCHANT_WHERE = { status: "ACTIVE" as const, deletedAt: null };

export async function listPublicMerchants(opts: { q?: string; type?: string } = {}) {
  const q = opts.q?.trim();
  const merchants = await prisma.merchant.findMany({
    where: {
      ...PUBLIC_MERCHANT_WHERE,
      ...(opts.type ? { businessType: opts.type } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { products: { some: { name: { contains: q, mode: "insensitive" }, active: true, deletedAt: null } } },
            ],
          }
        : {}),
    },
    include: { hours: true, zones: { where: { active: true } } },
    orderBy: [{ featured: "desc" }, { name: "asc" }],
  });
  return merchants.map((m) => ({ ...m, isOpen: isOpenAt(m.hours) && !m.salesPaused }));
}

export async function getPublicMerchantBySlug(slug: string) {
  const m = await prisma.merchant.findFirst({
    where: { slug, ...PUBLIC_MERCHANT_WHERE },
    include: { hours: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }] }, zones: { where: { active: true } }, settings: true },
  });
  if (!m) return null;
  return { ...m, isOpen: isOpenAt(m.hours) && !m.salesPaused };
}

export async function listBusinessTypes() {
  const rows = await prisma.merchant.groupBy({ by: ["businessType"], where: PUBLIC_MERCHANT_WHERE, _count: true, orderBy: { businessType: "asc" } });
  return rows.map((r) => ({ type: r.businessType, count: r._count }));
}
