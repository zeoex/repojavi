import { z } from "zod";

// Esquemas compartidos (servidor y formularios). El servidor SIEMPRE revalida.

const trimmed = (max: number) => z.string().trim().max(max);
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const moneyString = z
  .string()
  .trim()
  .regex(/^\d{1,10}([.,]\d{1,2})?$/, "Importe inválido (ej: 1500 o 1500,50)")
  .transform((v) => v.replace(",", "."));

export const optionalMoneyString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(
    z
      .string()
      .regex(/^\d{1,10}([.,]\d{1,2})?$/, "Importe inválido")
      .transform((v) => v.replace(",", "."))
      .nullable(),
  );

const httpsUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v.startsWith("/") || /^https:\/\//.test(v), "Usá una URL https:// o una ruta local");

export const urlOrEmpty = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(httpsUrl.nullable());

export const merchantCreateSchema = z.object({
  name: trimmed(80).min(2, "Ingresá el nombre"),
  businessType: trimmed(40).min(2),
  description: optionalTrimmed(1000),
  phone: optionalTrimmed(30),
  email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal("").transform(() => null)),
  adminEmail: z.string().trim().toLowerCase().email("Email del administrador inválido"),
});

export const merchantProfileSchema = z.object({
  name: trimmed(80).min(2, "Ingresá el nombre"),
  businessType: trimmed(40).min(2),
  description: optionalTrimmed(1000),
  phone: optionalTrimmed(30),
  email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal("").transform(() => null)),
  logoUrl: urlOrEmpty,
  coverUrl: urlOrEmpty,
  street: optionalTrimmed(120),
  streetNumber: optionalTrimmed(20),
  city: optionalTrimmed(80),
  province: optionalTrimmed(80),
  postalCode: optionalTrimmed(12),
  legalName: optionalTrimmed(120),
  taxId: optionalTrimmed(20),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM");
export const hoursSchema = z.array(
  z
    .object({ dayOfWeek: z.number().int().min(0).max(6), opensAt: hhmm, closesAt: hhmm })
    .refine((h) => h.opensAt !== h.closesAt, { message: "La hora de apertura y cierre no pueden ser iguales" }),
).max(21);

export const zoneSchema = z.object({
  name: trimmed(60).min(2),
  postalCodes: z
    .string()
    .transform((v) =>
      v
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().max(12)).min(1, "Ingresá al menos un código postal")),
  fee: moneyString,
  freeShippingOver: optionalMoneyString,
  minOrderAmount: moneyString.default("0"),
  etaMinMinutes: z.coerce.number().int().min(5).max(600),
  etaMaxMinutes: z.coerce.number().int().min(5).max(600),
  active: z.boolean().default(true),
}).refine((z) => z.etaMaxMinutes >= z.etaMinMinutes, { message: "El tiempo máximo debe ser mayor al mínimo", path: ["etaMaxMinutes"] });

export const categorySchema = z.object({ name: trimmed(60).min(2, "Ingresá un nombre") });

export const variantSchema = z.object({
  id: z.string().optional(),
  name: trimmed(60).min(1).default("Única"),
  sku: trimmed(40).min(1, "Ingresá el SKU").regex(/^[A-Za-z0-9._-]+$/, "SKU: solo letras, números, . _ -"),
  price: moneyString,
  promoPrice: optionalMoneyString,
  stock: z.coerce.number().int().min(0, "El stock no puede ser negativo").max(1_000_000),
  minStock: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().min(0).max(1_000_000).nullable()),
  active: z.boolean().default(true),
});

export const productSchema = z.object({
  name: trimmed(120).min(2, "Ingresá el nombre"),
  description: optionalTrimmed(2000),
  categoryId: z.string().optional().nullable().transform((v) => (v ? v : null)),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  imageUrls: z.array(httpsUrl).max(8).default([]),
  variants: z.array(variantSchema).min(1).max(30),
});

export const addressSchema = z.object({
  label: optionalTrimmed(40),
  street: trimmed(120).min(2, "Ingresá la calle"),
  streetNumber: trimmed(20).min(1, "Ingresá la altura"),
  apartment: optionalTrimmed(30),
  city: trimmed(80).min(2, "Ingresá la localidad"),
  province: trimmed(80).min(2, "Ingresá la provincia"),
  postalCode: trimmed(12).min(4, "Código postal inválido").transform((v) => v.toUpperCase()),
  instructions: optionalTrimmed(300),
  contactName: optionalTrimmed(80),
  contactPhone: optionalTrimmed(30),
  isDefault: z.boolean().default(false),
});

export const checkoutSchema = z.object({
  merchantId: z.string().min(1),
  addressId: z.string().min(1, "Elegí una dirección de entrega"),
  contactName: trimmed(80).min(2, "Ingresá un nombre de contacto"),
  contactPhone: trimmed(30).min(6, "Ingresá un teléfono de contacto"),
  idempotencyKey: z.string().min(8).max(100),
});

export const courierSchema = z.object({
  name: trimmed(80).min(2),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  phone: optionalTrimmed(30),
  vehicle: optionalTrimmed(40),
});

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join(".");
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}
