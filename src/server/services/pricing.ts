import type { DeliveryZone, Prisma } from "@prisma/client";
import { ZERO, dec, effectivePrice, round2 } from "@/lib/money";

export type PricedLine = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: Prisma.Decimal;
  listPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
  available: number;
  problem: string | null;
};

type VariantForPricing = {
  id: string;
  name: string;
  sku: string;
  price: Prisma.Decimal;
  promoPrice: Prisma.Decimal | null;
  active: boolean;
  deletedAt: Date | null;
  inventory: { quantity: number; reserved: number } | null;
  product: { id: string; name: string; active: boolean; deletedAt: Date | null; images: { url: string }[] };
};

export function priceLine(variant: VariantForPricing, quantity: number): PricedLine {
  const unit = effectivePrice(variant.price, variant.promoPrice);
  const available = variant.inventory ? Math.max(0, variant.inventory.quantity - variant.inventory.reserved) : 0;
  let problem: string | null = null;
  if (!variant.active || variant.deletedAt || !variant.product.active || variant.product.deletedAt) problem = "Ya no está disponible";
  else if (available === 0) problem = "Sin stock";
  else if (quantity > available) problem = `Solo quedan ${available} unidades`;
  return {
    variantId: variant.id,
    productId: variant.product.id,
    productName: variant.product.name,
    variantName: variant.name,
    sku: variant.sku,
    imageUrl: variant.product.images[0]?.url ?? null,
    unitPrice: unit,
    listPrice: variant.price,
    quantity,
    lineTotal: round2(unit.mul(quantity)),
    available,
    problem,
  };
}

/** Busca la zona del comercio que cubre el código postal. */
export function findZone<Z extends Pick<DeliveryZone, "postalCodes" | "active">>(zones: Z[], postalCode: string): Z | null {
  const pc = postalCode.trim().toUpperCase();
  const digits = pc.replace(/\D/g, "");
  return (
    zones.find(
      (z) =>
        z.active &&
        z.postalCodes.some((code) => {
          const c = code.toUpperCase();
          return c === pc || (digits.length >= 4 && c.replace(/\D/g, "") === digits);
        }),
    ) ?? null
  );
}

export type Totals = {
  subtotal: Prisma.Decimal;
  listSubtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  total: Prisma.Decimal;
};

/**
 * Totales. "discountTotal" informa el ahorro por precios promocionales (ya incluido en el subtotal).
 * total = subtotal + envío.
 */
export function computeTotals(
  lines: Pick<PricedLine, "lineTotal" | "listPrice" | "quantity">[],
  zone: Pick<DeliveryZone, "fee" | "freeShippingOver"> | null,
): Totals {
  const subtotal = round2(lines.reduce((acc, l) => acc.add(l.lineTotal), ZERO));
  const listSubtotal = round2(lines.reduce((acc, l) => acc.add(dec(l.listPrice).mul(l.quantity)), ZERO));
  let shippingFee = zone ? dec(zone.fee) : ZERO;
  if (zone?.freeShippingOver && subtotal.greaterThanOrEqualTo(zone.freeShippingOver)) shippingFee = ZERO;
  return {
    subtotal,
    listSubtotal,
    discountTotal: round2(listSubtotal.sub(subtotal)),
    shippingFee: round2(shippingFee),
    total: round2(subtotal.add(shippingFee)),
  };
}
