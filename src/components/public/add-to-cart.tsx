"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToCartAction } from "@/app/actions/customer";
import { Badge, Button, cx } from "@/components/ui";

export type VariantOption = {
  id: string;
  name: string;
  priceLabel: string;
  listPriceLabel: string | null;
  available: number;
};

const LOW = 5;
const MAX_PER_LINE = 50;

export function AddToCart({
  productName,
  variants,
  loggedIn,
  loginHref,
  blockedReason,
}: {
  productName: string;
  variants: VariantOption[];
  loggedIn: boolean;
  loginHref: string;
  blockedReason: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const firstAvailable = variants.find((v) => v.available > 0) ?? variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? "");
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [confirm, setConfirm] = useState<{ otherMerchants: string[]; merchantName: string } | null>(null);

  const v = variants.find((x) => x.id === variantId) ?? variants[0];
  const max = Math.min(v?.available ?? 0, MAX_PER_LINE);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2500);
    return () => clearTimeout(t);
  }, [added]);

  if (!v) return null;

  function submit(confirmed: boolean) {
    setError(null);
    setAdded(false);
    startTransition(async () => {
      const r = await addToCartAction(v.id, qty, confirmed);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data?.needsConfirmation) {
        setConfirm({ otherMerchants: r.data.otherMerchants ?? [], merchantName: r.data.merchantName });
        return;
      }
      setConfirm(null);
      setAdded(true);
      setQty(1);
      router.refresh();
    });
  }

  const outOfStock = v.available === 0;

  return (
    <div className="mt-auto space-y-3">
      {variants.length > 1 && (
        <div className="space-y-1">
          <label htmlFor={`${id}-variant`} className="block text-xs font-medium text-gray-700">
            Variante
          </label>
          <select
            id={`${id}-variant`}
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setQty(1);
              setConfirm(null);
              setError(null);
            }}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {variants.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {o.priceLabel}
                {o.available === 0 ? " (sin stock)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-baseline gap-2">
          <span className={cx("font-bold", v.listPriceLabel ? "text-accent-600" : "text-gray-900")}>{v.priceLabel}</span>
          {v.listPriceLabel && (
            <span className="text-xs text-gray-500 line-through">
              <span className="sr-only">Antes </span>
              {v.listPriceLabel}
            </span>
          )}
        </span>
        {outOfStock ? <Badge tone="gray">Sin stock</Badge> : v.available <= LOW ? <Badge tone="amber">Quedan {v.available}</Badge> : null}
      </div>

      {!loggedIn ? (
        <Link href={loginHref} className="inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          Ingresá para comprar
        </Link>
      ) : blockedReason ? (
        <p className="rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-700">{blockedReason}</p>
      ) : outOfStock ? (
        <Button type="button" disabled className="w-full">
          Sin stock
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-gray-300" role="group" aria-label={`Cantidad de ${productName}`}>
            <button
              type="button"
              className="h-10 w-9 rounded-l-xl text-lg font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1 || pending}
              aria-label="Restar una unidad"
            >
              −
            </button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              className="h-10 w-9 rounded-r-xl text-lg font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40"
              onClick={() => setQty((q) => Math.min(max, q + 1))}
              disabled={qty >= max || pending}
              aria-label="Sumar una unidad"
            >
              +
            </button>
          </div>
          <Button type="button" className="flex-1" onClick={() => submit(false)} disabled={pending || !!confirm} aria-busy={pending}>
            {pending ? "Agregando…" : added ? "Agregado ✓" : "Agregar"}
          </Button>
        </div>
      )}

      <div aria-live="polite" className="space-y-2">
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        {added && <p className="text-xs font-medium text-emerald-700">Agregado ✓ al carrito</p>}
        {confirm && (
          <div role="alertdialog" aria-labelledby={`${id}-confirm`} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p id={`${id}-confirm`}>
              Tenés productos en el carrito de <strong>{confirm.otherMerchants.join(", ")}</strong>. Cada comercio tiene su propio carrito y se paga por
              separado. ¿Querés agregar este producto al carrito de <strong>{confirm.merchantName}</strong>?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => submit(true)} disabled={pending} className="px-3 py-2">
                {pending ? "Agregando…" : "Sí, agregar"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirm(null)} disabled={pending} className="px-3 py-2">
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
