import Link from "next/link";
import type { MerchantStatus, OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABEL } from "@/server/domain/orderStatus";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function pageParam(sp: Record<string, string | string[] | undefined>, key = "page"): number {
  const n = Number.parseInt(param(sp, key), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha YYYY-MM-DD interpretada en hora de Argentina (UTC-3). */
export function parseDayAR(raw: string, endOfDay = false): Date | undefined {
  if (!DATE_RE.test(raw)) return undefined;
  const d = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}-03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

export function parseOrderStatus(raw: string): OrderStatus | undefined {
  return (ORDER_STATUSES as string[]).includes(raw) ? (raw as OrderStatus) : undefined;
}

/** Construye un href conservando los filtros actuales. */
export function hrefWith(base: string, params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || (/page$/.test(k) && Number(v) <= 1)) continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export function Pagination({
  base,
  params,
  page,
  pages,
  total,
  pageKey = "page",
}: {
  base: string;
  params: Record<string, string | number>;
  page: number;
  pages: number;
  total: number;
  pageKey?: string;
}) {
  if (pages <= 1) return <p className="mt-3 text-xs text-gray-500">{total} resultado{total === 1 ? "" : "s"}</p>;
  const link = "rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50";
  return (
    <nav aria-label="Paginación" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-gray-500">
        Página {page} de {pages} · {total} resultados
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className={link} href={hrefWith(base, { ...params, [pageKey]: page - 1 })} rel="prev">
            ← Anterior
          </Link>
        )}
        {page < pages && (
          <Link className={link} href={hrefWith(base, { ...params, [pageKey]: page + 1 })} rel="next">
            Siguiente →
          </Link>
        )}
      </div>
    </nav>
  );
}

export const MERCHANT_STATUS: Record<MerchantStatus, { label: string; tone: "green" | "amber" | "red" }> = {
  ACTIVE: { label: "Activo", tone: "green" },
  PENDING: { label: "Pendiente", tone: "amber" },
  SUSPENDED: { label: "Suspendido", tone: "red" },
};
