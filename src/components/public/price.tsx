import type { Prisma } from "@prisma/client";
import { effectivePrice, formatARS } from "@/lib/money";
import { cx } from "@/components/ui";

/** Precio con promoción: muestra el de lista tachado cuando hay precio promocional vigente. */
export function Price({ price, promoPrice, className }: { price: Prisma.Decimal; promoPrice: Prisma.Decimal | null; className?: string }) {
  const eff = effectivePrice(price, promoPrice);
  const hasPromo = !eff.equals(price);
  return (
    <span className={cx("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cx("font-bold", hasPromo ? "text-accent-600" : "text-gray-900")}>{formatARS(eff)}</span>
      {hasPromo && (
        <span className="text-xs text-gray-500 line-through">
          <span className="sr-only">Antes </span>
          {formatARS(price)}
        </span>
      )}
    </span>
  );
}
