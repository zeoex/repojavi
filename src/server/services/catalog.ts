import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { slugify } from "@/lib/slug";
import { dec } from "@/lib/money";
import { categorySchema, productSchema } from "@/lib/validation";
import { type Actor, assertMerchantAccess } from "@/server/actor";
import { parseOrThrow } from "@/server/parse";
import { audit } from "./audit";
import { PUBLIC_MERCHANT_WHERE } from "./merchants";

// ───────────── Categorías ─────────────

/** Categorías visibles para un comercio: globales + propias. */
export async function listCategoriesForMerchant(merchantId: string) {
  return prisma.category.findMany({
    where: { deletedAt: null, OR: [{ merchantId: null }, { merchantId }] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createMerchantCategory(actor: Actor, merchantId: string, input: unknown) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const { name } = parseOrThrow(categorySchema, input);
  const slug = slugify(name);
  const clash = await prisma.category.findFirst({ where: { slug, deletedAt: null, OR: [{ merchantId: null }, { merchantId }] } });
  if (clash) throw new ConflictError("Ya existe una categoría con ese nombre.");
  const c = await prisma.category.create({ data: { merchantId, name, slug } });
  await audit({ actorId: actor.userId, action: "category.create", entityType: "Category", entityId: c.id, merchantId });
  return c;
}

export async function deleteMerchantCategory(actor: Actor, merchantId: string, categoryId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  // Solo categorías PROPIAS del comercio; las globales no se pueden borrar desde un comercio.
  const r = await prisma.category.updateMany({
    where: { id: categoryId, merchantId, deletedAt: null },
    data: { deletedAt: new Date(), slug: `${categoryId}-eliminada` },
  });
  if (r.count === 0) throw new NotFoundError();
  await prisma.product.updateMany({ where: { categoryId, merchantId }, data: { categoryId: null } });
  await audit({ actorId: actor.userId, action: "category.delete", entityType: "Category", entityId: categoryId, merchantId });
}

// ───────────── Productos ─────────────

async function assertCategoryUsable(categoryId: string | null, merchantId: string) {
  if (!categoryId) return;
  const c = await prisma.category.findFirst({ where: { id: categoryId, deletedAt: null, OR: [{ merchantId: null }, { merchantId }] } });
  if (!c) throw new ValidationError("Categoría inválida");
}

/**
 * Crea o actualiza un producto con sus variantes e inventario en una única transacción.
 * El catálogo público lee directamente de la base, por lo que los cambios se publican al guardar.
 */
export async function saveProduct(actor: Actor, merchantId: string, productId: string | null, input: unknown) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const data = parseOrThrow(productSchema, input);
  await assertCategoryUsable(data.categoryId, merchantId);

  for (const v of data.variants) {
    if (v.promoPrice && dec(v.promoPrice).greaterThanOrEqualTo(dec(v.price)))
      throw new ValidationError(`El precio promocional de "${v.name}" debe ser menor al precio de lista`);
  }
  const skus = data.variants.map((v) => v.sku.toUpperCase());
  if (new Set(skus).size !== skus.length) throw new ValidationError("Hay SKUs repetidos en las variantes");

  try {
    const product = await prisma.$transaction(async (tx) => {
      let p;
      if (productId) {
        const existing = await tx.product.findFirst({ where: { id: productId, merchantId, deletedAt: null } });
        if (!existing) throw new NotFoundError("Producto no encontrado");
        p = await tx.product.update({
          where: { id: productId },
          data: { name: data.name, description: data.description, categoryId: data.categoryId, active: data.active, featured: data.featured },
        });
        await tx.productImage.deleteMany({ where: { productId } });
      } else {
        p = await tx.product.create({
          data: { merchantId, name: data.name, description: data.description, categoryId: data.categoryId, active: data.active, featured: data.featured },
        });
      }
      if (data.imageUrls.length) {
        await tx.productImage.createMany({ data: data.imageUrls.map((url, i) => ({ productId: p.id, url, alt: data.name, sortOrder: i })) });
      }

      const keepIds: string[] = [];
      for (const [i, v] of data.variants.entries()) {
        const fields = {
          name: v.name,
          sku: v.sku.toUpperCase(),
          price: dec(v.price),
          promoPrice: v.promoPrice ? dec(v.promoPrice) : null,
          active: v.active,
          sortOrder: i,
        };
        if (v.id) {
          const ex = await tx.productVariant.findFirst({ where: { id: v.id, productId: p.id, merchantId, deletedAt: null }, include: { inventory: true } });
          if (!ex) throw new ValidationError("Variante inválida");
          await tx.productVariant.update({ where: { id: v.id }, data: fields });
          const inv = ex.inventory ?? (await tx.inventory.create({ data: { variantId: v.id } }));
          await setStockTx(tx, inv.id, v.stock, v.minStock ?? null, actor.userId);
          keepIds.push(v.id);
        } else {
          const nv = await tx.productVariant.create({ data: { ...fields, productId: p.id, merchantId } });
          const inv = await tx.inventory.create({ data: { variantId: nv.id, quantity: 0, minStock: v.minStock ?? null } });
          await setStockTx(tx, inv.id, v.stock, v.minStock ?? null, actor.userId);
          keepIds.push(nv.id);
        }
      }
      // Variantes quitadas: eliminación lógica (los pedidos históricos las referencian)
      const removed = await tx.productVariant.findMany({ where: { productId: p.id, id: { notIn: keepIds }, deletedAt: null } });
      for (const r of removed) {
        await tx.productVariant.update({ where: { id: r.id }, data: { deletedAt: new Date(), active: false, sku: `${r.sku}~DEL~${r.id.slice(-6)}` } });
      }
      return p;
    });
    await audit({ actorId: actor.userId, action: productId ? "product.update" : "product.create", entityType: "Product", entityId: product.id, merchantId });
    return product;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new ConflictError("Ya existe otro producto con ese SKU en tu comercio.");
    throw e;
  }
}

/** Fija la cantidad física. No permite dejarla por debajo de lo reservado por pedidos pendientes. */
async function setStockTx(tx: Prisma.TransactionClient, inventoryId: string, quantity: number, minStock: number | null, actorId: string) {
  const inv = await tx.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
  if (quantity < inv.reserved)
    throw new ValidationError(`No podés fijar el stock en ${quantity}: hay ${inv.reserved} unidades reservadas por pedidos pendientes.`);
  const delta = quantity - inv.quantity;
  await tx.inventory.update({ where: { id: inventoryId }, data: { quantity, minStock } });
  if (delta !== 0) {
    await tx.inventoryMovement.create({ data: { inventoryId, type: "ADJUSTMENT", quantityDelta: delta, actorId, note: "Ajuste manual" } });
  }
}

/** Ajuste rápido de stock desde la grilla de inventario. */
export async function adjustStock(actor: Actor, merchantId: string, variantId: string, quantity: number) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) throw new ValidationError("Cantidad inválida");
  await prisma.$transaction(async (tx) => {
    const v = await tx.productVariant.findFirst({ where: { id: variantId, merchantId, deletedAt: null }, include: { inventory: true } });
    if (!v) throw new NotFoundError();
    const inv = v.inventory ?? (await tx.inventory.create({ data: { variantId } }));
    // Bloqueo de fila para no pisar una reserva concurrente
    await tx.$executeRaw`SELECT 1 FROM "Inventory" WHERE id = ${inv.id} FOR UPDATE`;
    await setStockTx(tx, inv.id, quantity, inv.minStock, actor.userId);
  });
  await audit({ actorId: actor.userId, action: "inventory.adjust", entityType: "ProductVariant", entityId: variantId, merchantId, metadata: { quantity } });
}

export async function setProductActive(actor: Actor, merchantId: string, productId: string, active: boolean) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const r = await prisma.product.updateMany({ where: { id: productId, merchantId, deletedAt: null }, data: { active } });
  if (r.count === 0) throw new NotFoundError();
  await audit({ actorId: actor.userId, action: active ? "product.activate" : "product.deactivate", entityType: "Product", entityId: productId, merchantId });
}

export async function softDeleteProduct(actor: Actor, merchantId: string, productId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const r = await prisma.product.updateMany({ where: { id: productId, merchantId, deletedAt: null }, data: { deletedAt: new Date(), active: false } });
  if (r.count === 0) throw new NotFoundError();
  await prisma.cartItem.deleteMany({ where: { variant: { productId } } });
  await audit({ actorId: actor.userId, action: "product.delete", entityType: "Product", entityId: productId, merchantId });
}

export async function getProductForMerchant(actor: Actor, merchantId: string, productId: string) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  const p = await prisma.product.findFirst({
    where: { id: productId, merchantId, deletedAt: null },
    include: { images: { orderBy: { sortOrder: "asc" } }, variants: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, include: { inventory: true } } },
  });
  if (!p) throw new NotFoundError();
  return p;
}

export async function listProductsForMerchant(actor: Actor, merchantId: string, opts: { q?: string } = {}) {
  await assertMerchantAccess(actor, merchantId, { allowSuperadmin: true });
  return prisma.product.findMany({
    where: { merchantId, deletedAt: null, ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" } } : {}) },
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      variants: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, include: { inventory: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

// ───────────── Catálogo público ─────────────

const publicVariantWhere = { active: true, deletedAt: null } satisfies Prisma.ProductVariantWhereInput;

export const publicProductWhere = {
  active: true,
  deletedAt: null,
  merchant: PUBLIC_MERCHANT_WHERE,
  variants: { some: publicVariantWhere },
} satisfies Prisma.ProductWhereInput;

const publicProductInclude = {
  images: { orderBy: { sortOrder: "asc" as const } },
  category: true,
  variants: { where: publicVariantWhere, orderBy: { sortOrder: "asc" as const }, include: { inventory: true } },
} satisfies Prisma.ProductInclude;

export type PublicProduct = Prisma.ProductGetPayload<{ include: typeof publicProductInclude }>;

export function availableUnits(inv: { quantity: number; reserved: number } | null | undefined) {
  return inv ? Math.max(0, inv.quantity - inv.reserved) : 0;
}

export async function listPublicProducts(merchantId: string, opts: { q?: string; categoryId?: string; onlyAvailable?: boolean } = {}) {
  const products = await prisma.product.findMany({
    where: {
      ...publicProductWhere,
      merchantId,
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { description: { contains: opts.q, mode: "insensitive" } }] } : {}),
    },
    include: publicProductInclude,
    orderBy: [{ featured: "desc" }, { name: "asc" }],
  });
  return opts.onlyAvailable ? products.filter((p) => p.variants.some((v) => availableUnits(v.inventory) > 0)) : products;
}

export async function searchPublicProducts(q: string, take = 24) {
  return prisma.product.findMany({
    where: { ...publicProductWhere, OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] },
    include: { ...publicProductInclude, merchant: { select: { id: true, name: true, slug: true, salesPaused: true } } },
    orderBy: { name: "asc" },
    take,
  });
}

export async function featuredProducts(take = 8) {
  return prisma.product.findMany({
    where: { ...publicProductWhere, featured: true },
    include: { ...publicProductInclude, merchant: { select: { id: true, name: true, slug: true, salesPaused: true } } },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export async function categoriesInUse(merchantId: string) {
  return prisma.category.findMany({
    where: { deletedAt: null, products: { some: { ...publicProductWhere, merchantId } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
