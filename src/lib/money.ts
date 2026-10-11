import { Prisma } from "@prisma/client";

// Toda la aritmética monetaria usa Decimal (decimal.js vía Prisma). Nunca number/float.
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export function dec(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export const ZERO = new Prisma.Decimal(0);

export function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Precio efectivo: el promocional si existe y es menor al de lista. */
export function effectivePrice(price: Prisma.Decimal, promoPrice?: Prisma.Decimal | null) {
  if (promoPrice && promoPrice.greaterThanOrEqualTo(0) && promoPrice.lessThan(price)) return promoPrice;
  return price;
}

const arsFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatea en pesos argentinos: $ 1.234,50 */
export function formatARS(value: Prisma.Decimal | string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const s = typeof value === "object" ? value.toFixed(2) : String(value);
  // Intl solo acepta number; el valor ya está redondeado a 2 decimales, solo se usa para mostrar.
  return arsFormatter.format(Number(s));
}

/** Parsea un importe ingresado por un usuario ("1.234,50" o "1234.50"). */
export function parseMoneyInput(raw: string): Prisma.Decimal | null {
  const t = raw.trim().replace(/\s|\$/g, "");
  if (!t) return null;
  let normalized = t;
  if (t.includes(",")) normalized = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
}
