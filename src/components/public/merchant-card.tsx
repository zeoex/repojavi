import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Badge, cx } from "@/components/ui";
import { formatARS } from "@/lib/money";

type ZoneLite = { name: string; fee: Prisma.Decimal; etaMinMinutes: number; etaMaxMinutes: number };

export type MerchantCardData = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  businessType: string;
  logoUrl: string | null;
  coverUrl: string | null;
  salesPaused: boolean;
  featured: boolean;
  isOpen: boolean;
  zones: ZoneLite[];
};

/** Resumen de envío: rango de demora y costo de la zona más barata. */
export function deliverySummary(zones: ZoneLite[]) {
  if (zones.length === 0) return null;
  const etaMin = Math.min(...zones.map((z) => z.etaMinMinutes));
  const etaMax = Math.max(...zones.map((z) => z.etaMaxMinutes));
  const cheapest = zones.reduce((a, z) => (z.fee.lessThan(a.fee) ? z : a), zones[0]);
  return { etaMin, etaMax, minFee: cheapest.fee, zoneNames: zones.map((z) => z.name) };
}

export function OpenBadge({ isOpen, salesPaused }: { isOpen: boolean; salesPaused: boolean }) {
  if (salesPaused) return <Badge tone="amber">Ventas pausadas</Badge>;
  return isOpen ? <Badge tone="green">Abierto</Badge> : <Badge tone="gray">Cerrado</Badge>;
}

export function MerchantCard({ m, className }: { m: MerchantCardData; className?: string }) {
  const d = deliverySummary(m.zones);
  return (
    <Link
      href={`/comercios/${m.slug}`}
      className={cx(
        "group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-brand-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500",
        className,
      )}
    >
      <div className="relative h-28 bg-gradient-to-br from-brand-100 to-brand-50">
        {m.coverUrl && <img src={m.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <div className="absolute right-2 top-2 flex gap-1">
          <OpenBadge isOpen={m.isOpen} salesPaused={m.salesPaused} />
        </div>
      </div>
      <div className="flex flex-1 gap-3 p-4">
        <div className="-mt-10 h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-white shadow">
          {m.logoUrl ? (
            <img src={m.logoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-brand-50 text-xl font-bold text-brand-700" aria-hidden>
              {m.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-gray-900 group-hover:text-brand-700">{m.name}</h3>
          <p className="text-xs text-gray-500">{m.businessType}</p>
          {m.description && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{m.description}</p>}
          {d ? (
            <div className="mt-2 space-y-0.5 text-xs text-gray-600">
              <p>
                🛵 Envío en {d.etaMin}–{d.etaMax} min · Envío desde {formatARS(d.minFee)}
              </p>
              <p className="truncate" title={d.zoneNames.join(", ")}>
                Zonas: {d.zoneNames.join(", ")}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Sin zonas de envío configuradas</p>
          )}
        </div>
      </div>
    </Link>
  );
}
