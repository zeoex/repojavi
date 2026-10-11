import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/server/actor";
import { computeTotals, findZone, priceLine } from "./pricing";

const variantInclude = {
  inventory: true,
  product: { select: { id: true, name: true, active: true, deletedAt: true, merchantId: true, images: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { url: true } } } },
} as const;

export const MAX_QTY_PER_LINE = 50;

/**
 * Agrega un producto al carrito DE SU COMERCIO. Cada comercio tiene su carrito y su pedido;
 * nunca se mezclan. Si el cliente tiene carritos con productos de otros comercios y no
 * confirmó explícitamente, se devuelve needsConfirmation para que la UI lo informe.
 */
export async function addToCart(actor: Actor, variantId: string, quantity: number, opts: { confirmed?: boolean } = {}) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) throw new ValidationError("Cantidad inválida");
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, active: true, deletedAt: null, product: { active: true, deletedAt: null } },
    include: { ...variantInclude, product: { include: { merchant: true, images: { take: 1 } } } },
  });
  if (!variant) throw new NotFoundError("El producto ya no está disponible.");
  const merchant = variant.product.merchant;
  if (merchant.status !== "ACTIVE" || merchant.deletedAt) throw new ConflictError("Este comercio no está disponible.");
  if (merchant.salesPaused) throw new ConflictError(`${merchant.name} pausó temporalmente sus ventas.`);

  if (!opts.confirmed) {
    const others = await prisma.cart.findMany({
      where: { userId: actor.userId, merchantId: { not: merchant.id }, items: { some: {} } },
      include: { merchant: { select: { name: true } } },
    });
    if (others.length) {
      return { needsConfirmation: true as const, otherMerchants: others.map((c) => c.merchant.name), merchantName: merchant.name };
    }
  }

  const cart = await prisma.cart.upsert({
    where: { userId_merchantId: { userId: actor.userId, merchantId: merchant.id } },
    create: { userId: actor.userId, merchantId: merchant.id },
    update: {},
  });
  const existing = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
  const newQty = (existing?.quantity ?? 0) + quantity;
  const available = variant.inventory ? variant.inventory.quantity - variant.inventory.reserved : 0;
  if (newQty > available) throw new ConflictError(available > 0 ? `Solo hay ${available} unidades disponibles.` : "Producto sin stock.");
  if (newQty > MAX_QTY_PER_LINE) throw new ValidationError(`Máximo ${MAX_QTY_PER_LINE} unidades por producto.`);
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: { cartId: cart.id, variantId, quantity: newQty },
    update: { quantity: newQty },
  });
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  return { needsConfirmation: false as const, cartId: cart.id, merchantName: merchant.name };
}

/** Cambia la cantidad (0 = quitar). Solo sobre ítems de carritos del propio usuario. */
export async function setCartItemQuantity(actor: Actor, itemId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QTY_PER_LINE) throw new ValidationError("Cantidad inválida");
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId: actor.userId } }, include: { variant: { include: { inventory: true } } } });
  if (!item) throw new NotFoundError();
  if (quantity === 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
    return;
  }
  const inv = item.variant.inventory;
  const available = inv ? inv.quantity - inv.reserved : 0;
  if (quantity > available) throw new ConflictError(available > 0 ? `Solo hay ${available} unidades disponibles.` : "Producto sin stock.");
  await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
}

export async function clearCart(actor: Actor, merchantId: string) {
  await prisma.cartItem.deleteMany({ where: { cart: { userId: actor.userId, merchantId } } });
}

/** Lista de carritos con ítems del usuario (uno por comercio). */
export async function listCarts(userId: string) {
  const carts = await prisma.cart.findMany({
    where: { userId, items: { some: {} } },
    include: { merchant: { select: { id: true, name: true, slug: true, logoUrl: true } }, items: { select: { quantity: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return carts.map((c) => ({ ...c, itemCount: c.items.reduce((a, i) => a + i.quantity, 0) }));
}

export async function cartCount(userId: string) {
  const r = await prisma.cartItem.aggregate({ where: { cart: { userId } }, _sum: { quantity: true } });
  return r._sum.quantity ?? 0;
}

/**
 * Carrito de un comercio con importes recalculados en el servidor a partir del catálogo actual.
 * Si se indica una dirección, calcula zona y envío.
 */
export async function getPricedCart(userId: string, merchantId: string, addressId?: string | null) {
  const cart = await prisma.cart.findUnique({
    where: { userId_merchantId: { userId, merchantId } },
    include: {
      merchant: { include: { zones: { where: { active: true } }, settings: true } },
      items: { include: { variant: { include: variantInclude } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!cart) return null;
  const lines = cart.items.map((i) => ({ itemId: i.id, ...priceLine(i.variant, i.quantity) }));
  let zone = null;
  let address = null;
  if (addressId) {
    address = await prisma.address.findFirst({ where: { id: addressId, userId, deletedAt: null } });
    if (address) zone = findZone(cart.merchant.zones, address.postalCode);
  }
  const totals = computeTotals(lines.filter((l) => !l.problem), zone);
  return { cart, merchant: cart.merchant, lines, zone, address, totals };
}
