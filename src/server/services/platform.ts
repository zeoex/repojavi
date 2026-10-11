import "server-only";
import { z } from "zod";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { type Actor, assertSuperadmin } from "@/server/actor";
import { parseOrThrow } from "@/server/parse";
import { audit } from "./audit";

// ───────────── Parámetros de plataforma ─────────────

export type PlatformSettings = { announcement: string; supportEmail: string };

const SETTING_KEYS = ["announcement", "supportEmail"] as const;

const DEFAULTS: PlatformSettings = { announcement: "", supportEmail: "" };

export const platformSettingsSchema = z.object({
  announcement: z.string().trim().max(200, "El anuncio puede tener hasta 200 caracteres"),
  supportEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(120)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Email de soporte inválido"),
});

/** Lectura pública (sin datos sensibles). Si la base falla, devuelve los valores por defecto. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
    const out: PlatformSettings = { ...DEFAULTS };
    for (const r of rows) {
      if (typeof r.value === "string" && (r.key === "announcement" || r.key === "supportEmail")) out[r.key] = r.value;
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

export async function updatePlatformSettings(actor: Actor, input: unknown): Promise<PlatformSettings> {
  assertSuperadmin(actor);
  const data = parseOrThrow(platformSettingsSchema, input);
  await prisma.$transaction(
    SETTING_KEYS.map((key) =>
      prisma.platformSetting.upsert({
        where: { key },
        create: { key, value: data[key] },
        update: { value: data[key] },
      }),
    ),
  );
  await audit({
    actorId: actor.userId,
    action: "platform.settings.update",
    entityType: "PlatformSetting",
    metadata: { announcement: data.announcement, supportEmail: data.supportEmail },
  });
  return data;
}

// ───────────── Consultas del superadmin ─────────────

export const ADMIN_PAGE_SIZE = 50;

function skipFor(page: number | undefined) {
  const p = Number.isFinite(page) && page && page > 1 ? Math.floor(page) : 1;
  return { page: p, skip: (p - 1) * ADMIN_PAGE_SIZE, take: ADMIN_PAGE_SIZE };
}

export type Paged<T> = { rows: T[]; total: number; page: number; pages: number };

function paged<T>(rows: T[], total: number, page: number): Paged<T> {
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function listUsers(actor: Actor, opts: { q?: string; page?: number } = {}) {
  assertSuperadmin(actor);
  const { page, skip, take } = skipFor(opts.page);
  const q = opts.q?.trim().slice(0, 100);
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
        status: true,
        createdAt: true,
        memberships: { select: { role: true, merchant: { select: { id: true, name: true, deletedAt: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);
  return paged(rows, total, page);
}

export type AdminOrderFilters = { merchantId?: string; status?: OrderStatus; from?: Date; to?: Date; page?: number };

export async function listAllOrders(actor: Actor, f: AdminOrderFilters = {}) {
  assertSuperadmin(actor);
  const { page, skip, take } = skipFor(f.page);
  const where: Prisma.OrderWhereInput = {
    ...(f.merchantId ? { merchantId: f.merchantId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        createdAt: true,
        customerEmail: true,
        contactName: true,
        merchantNameSnapshot: true,
        merchantId: true,
        payments: { select: { isSimulated: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);
  return paged(rows, total, page);
}

export async function getOrderAdmin(actor: Actor, id: string) {
  assertSuperadmin(actor);
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      payments: {
        orderBy: { createdAt: "desc" },
        include: { refunds: { orderBy: { createdAt: "desc" } } },
      },
      statusHistory: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true, email: true } } } },
      delivery: { include: { courier: { select: { id: true, name: true, phone: true } }, events: { orderBy: { createdAt: "asc" } } } },
      merchant: { select: { id: true, name: true, slug: true, phone: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!order) throw new NotFoundError("Pedido no encontrado");
  return order;
}

export async function listPayments(actor: Actor, pageNum?: number) {
  assertSuperadmin(actor);
  const { page, skip, take } = skipFor(pageNum);
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      select: {
        id: true,
        provider: true,
        providerPaymentId: true,
        status: true,
        statusDetail: true,
        amount: true,
        isSimulated: true,
        createdAt: true,
        merchantId: true,
        order: { select: { id: true, number: true, merchantNameSnapshot: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.payment.count(),
  ]);
  return paged(rows, total, page);
}

/** Notificaciones recibidas. Nunca se devuelve el payload: solo metadatos seguros. */
export async function listPaymentEvents(actor: Actor, pageNum?: number) {
  assertSuperadmin(actor);
  const { page, skip, take } = skipFor(pageNum);
  const [rows, total] = await Promise.all([
    prisma.paymentEvent.findMany({
      select: { id: true, provider: true, eventKey: true, topic: true, resourceId: true, signatureOk: true, processedAt: true, error: true, createdAt: true, paymentId: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.paymentEvent.count(),
  ]);
  return paged(rows, total, page);
}

export async function listAuditLogs(actor: Actor, f: { action?: string; merchantId?: string; page?: number } = {}) {
  assertSuperadmin(actor);
  const { page, skip, take } = skipFor(f.page);
  const action = f.action?.trim().slice(0, 100);
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
    ...(f.merchantId ? { merchantId: f.merchantId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.auditLog.count({ where }),
  ]);
  return paged(rows, total, page);
}

export async function listSystemEvents(actor: Actor, f: { level?: string; source?: string; page?: number } = {}) {
  assertSuperadmin(actor);
  const { page, skip, take } = skipFor(f.page);
  const level = f.level && ["info", "warn", "error"].includes(f.level) ? f.level : undefined;
  const source = f.source?.trim().slice(0, 60);
  const where: Prisma.SystemEventWhereInput = {
    ...(level ? { level } : {}),
    ...(source ? { source } : {}),
  };
  const [rows, total, sources] = await Promise.all([
    prisma.systemEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.systemEvent.count({ where }),
    prisma.systemEvent.groupBy({ by: ["source"], orderBy: { source: "asc" } }),
  ]);
  return { ...paged(rows, total, page), sources: sources.map((s) => s.source) };
}

export async function listMerchantsAdmin(actor: Actor) {
  assertSuperadmin(actor);
  return prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      businessType: true,
      status: true,
      featured: true,
      salesPaused: true,
      createdAt: true,
      deletedAt: true,
      paymentAccount: { select: { status: true } },
      _count: { select: { members: true, orders: true } },
    },
    orderBy: [{ deletedAt: { sort: "desc", nulls: "first" } }, { name: "asc" }],
  });
}

/** Opciones livianas para filtros (id + nombre). */
export async function listMerchantOptions(actor: Actor) {
  assertSuperadmin(actor);
  return prisma.merchant.findMany({ select: { id: true, name: true, deletedAt: true }, orderBy: { name: "asc" } });
}

export async function getMerchantAdmin(actor: Actor, id: string) {
  assertSuperadmin(actor);
  const m = await prisma.merchant.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, email: true, name: true, status: true } } }, orderBy: { createdAt: "asc" } },
      // Solo metadatos de la cuenta de cobro: nunca tokens.
      paymentAccount: { select: { status: true, liveMode: true, connectedAt: true, providerUserId: true, lastError: true } },
      _count: { select: { products: true, orders: true, couriers: true, zones: true } },
    },
  });
  if (!m) throw new NotFoundError("Comercio no encontrado");
  return m;
}
