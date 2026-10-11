import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Badge, Card, ProductImage } from "@/components/ui";
import { effectivePrice, formatARS } from "@/lib/money";
import { Price } from "./price";
import { AddToCart, type VariantOption } from "./add-to-cart";

export const LOW_STOCK_THRESHOLD = 5;

type VariantLite = {
  id: string;
  name: string;
  price: Prisma.Decimal;
  promoPrice: Prisma.Decimal | null;
  inventory: { quantity: number; reserved: number; minStock: number | null } | null;
};

export type ProductCardData = {
  id: string;
  name: string;
  description: string | null;
  images: { url: string; alt: string | null }[];
  variants: VariantLite[];
  merchant?: { name: string; slug: string; salesPaused: boolean };
};

function units(inv: VariantLite["inventory"]) {
  return inv ? Math.max(0, inv.quantity - inv.reserved) : 0;
}

export function stockLabel(available: number) {
  if (available === 0) return { text: "Sin stock", tone: "gray" as const };
  if (available <= LOW_STOCK_THRESHOLD) return { text: `Quedan ${available}`, tone: "amber" as const };
  return null;
}

/** Disponibilidad agregada del producto (todas sus variantes). */
function productStock(p: ProductCardData) {
  return p.variants.reduce((a, v) => a + units(v.inventory), 0);
}

/**
 * Tarjeta de producto.
 * - mode "buy": dentro del comercio, con selector de variante y botón de agregar.
 * - mode "link": en portada/búsqueda, enlaza al comercio.
 */
export function ProductCard({
  product,
  mode,
  purchase,
}: {
  product: ProductCardData;
  mode: "buy" | "link";
  purchase?: { loggedIn: boolean; loginHref: string; blockedReason: string | null };
}) {
  const img = product.images[0];
  // Variante más barata (precio efectivo) para el "Desde"
  const first = product.variants.reduce<VariantLite | undefined>(
    (a, v) => (!a || effectivePrice(v.price, v.promoPrice).lessThan(effectivePrice(a.price, a.promoPrice)) ? v : a),
    undefined,
  );
  const total = productStock(product);

  const options: VariantOption[] = product.variants.map((v) => {
    const eff = effectivePrice(v.price, v.promoPrice);
    return {
      id: v.id,
      name: v.name,
      priceLabel: formatARS(eff),
      listPriceLabel: eff.equals(v.price) ? null : formatARS(v.price),
      available: units(v.inventory),
    };
  });

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <ProductImage src={img?.url} alt={img?.alt || product.name} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-semibold leading-snug text-gray-900">{product.name}</h3>
          {product.merchant && (
            <Link href={`/comercios/${product.merchant.slug}`} className="text-xs font-medium text-brand-700 hover:underline">
              {product.merchant.name}
            </Link>
          )}
          {product.description && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{product.description}</p>}
        </div>

        {mode === "buy" && purchase ? (
          <AddToCart productName={product.name} variants={options} {...purchase} />
        ) : (
          <div className="mt-auto space-y-2">
            {first && (
              <div className="flex flex-wrap items-center gap-2">
                {product.variants.length > 1 && <span className="text-xs text-gray-500">Desde</span>}
                <Price price={first.price} promoPrice={first.promoPrice} />
                {(() => {
                  const s = stockLabel(total);
                  return s && <Badge tone={s.tone}>{s.text}</Badge>;
                })()}
                {total > 0 && !stockLabel(total) && <Badge tone="green">Disponible</Badge>}
                {product.merchant?.salesPaused && <Badge tone="amber">Ventas pausadas</Badge>}
              </div>
            )}
            {product.merchant && (
              <Link
                href={`/comercios/${product.merchant.slug}?q=${encodeURIComponent(product.name)}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Ver en {product.merchant.name}
              </Link>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
