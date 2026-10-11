import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getActor } from "@/server/authz";
import { getPricedCart } from "@/server/services/cart";
import { listAddresses } from "@/server/services/addresses";
import { getPublicMerchantBySlug } from "@/server/services/merchants";
import { checkoutAction, checkoutAddAddressAction } from "@/app/actions/customer";
import { Alert, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { CheckoutForm } from "@/components/public/checkout-form";
import { AddressForm } from "@/components/public/address-form";
import { AddressPicker } from "@/components/public/address-picker";
import { formatAddressLine } from "@/components/public/format";
import { formatARS } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finalizar compra" };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ merchantId: string }>; searchParams: Promise<{ address?: string; nueva?: string }> }) {
  const [{ merchantId }, sp] = await Promise.all([params, searchParams]);
  const self = `/checkout/${merchantId}`;
  const actor = await getActor();
  if (!actor) redirect(`/ingresar?callbackUrl=${encodeURIComponent(self)}`);

  const addresses = await listAddresses(actor.userId);
  const requested = typeof sp.address === "string" ? addresses.find((a) => a.id === sp.address) : undefined;
  const selected = requested ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  const priced = await getPricedCart(actor.userId, merchantId, selected?.id ?? null);
  if (!priced || priced.lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageTitle title="Finalizar compra" />
        <EmptyState title="No hay productos para pagar" description="Este carrito está vacío." action={<LinkButton href="/carrito">Ver mis carritos</LinkButton>} />
      </div>
    );
  }

  const { merchant, lines, zone, totals } = priced;
  const publicMerchant = await getPublicMerchantBySlug(merchant.slug);
  const problems = lines.filter((l) => l.problem);
  const minOrders = [merchant.settings?.minOrderAmount, zone?.minOrderAmount].filter((m) => m && m.greaterThan(0));
  const minOrder = minOrders.reduce((a, m) => (m!.greaterThan(a!) ? m : a), minOrders[0]);
  const belowMin = minOrder ? totals.subtotal.lessThan(minOrder) : false;

  const blockers: string[] = [];
  if (!publicMerchant) blockers.push("Este comercio no está disponible en este momento.");
  else if (merchant.salesPaused) blockers.push(`${merchant.name} pausó temporalmente sus ventas.`);
  else if (!publicMerchant.isOpen) blockers.push(`${merchant.name} está cerrado en este momento. Vas a poder pagar cuando abra.`);
  if (problems.length) blockers.push("Hay productos sin stock suficiente o que ya no están disponibles. Revisá tu carrito.");
  if (!selected) blockers.push("Agregá una dirección de entrega.");
  else if (!zone) blockers.push(`Este comercio no entrega en tu código postal (${selected.postalCode}). Elegí otra dirección.`);
  if (belowMin && minOrder) blockers.push(`El pedido mínimo es de ${formatARS(minOrder)}.`);

  // Clave de idempotencia generada en el servidor: un doble envío devuelve el mismo pedido.
  const idempotencyKey = randomUUID();
  const showNewForm = addresses.length === 0 || sp.nueva === "1";
  const qs = selected ? `address=${encodeURIComponent(selected.id)}&` : "";

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle
        title="Finalizar compra"
        subtitle={
          <>
            Pedido a <strong>{merchant.name}</strong> ·{" "}
            <Link href={`/carrito/${merchant.id}`} className="font-medium text-brand-700 hover:underline">
              Volver al carrito
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">1. Dirección de entrega</h2>
              {addresses.length > 0 && !showNewForm && (
                <Link href={`${self}?${qs}nueva=1#nueva-direccion`} className="text-sm font-medium text-brand-700 hover:underline">
                  + Agregar otra dirección
                </Link>
              )}
            </div>
            {addresses.length > 0 && (
              <AddressPicker
                selectedId={selected?.id ?? null}
                addresses={addresses.map((a) => ({ id: a.id, title: a.label || `${a.street} ${a.streetNumber}`, detail: formatAddressLine(a), isDefault: a.isDefault }))}
              />
            )}
            {selected && !zone && <Alert tone="error">Este comercio no entrega en tu código postal ({selected.postalCode}). Elegí otra dirección o agregá una nueva.</Alert>}
            {selected && zone && (
              <Alert tone="success">
                Zona <strong>{zone.name}</strong> · Envío {totals.shippingFee.isZero() ? "gratis" : formatARS(totals.shippingFee)} · Llega en {zone.etaMinMinutes}–{zone.etaMaxMinutes} min
                {zone.freeShippingOver && totals.shippingFee.greaterThan(0) && <> · Envío gratis desde {formatARS(zone.freeShippingOver)}</>}
              </Alert>
            )}
            {showNewForm && (
              <div id="nueva-direccion" className="space-y-3 rounded-xl border border-dashed border-gray-300 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Nueva dirección</h3>
                  {addresses.length > 0 && (
                    <Link href={`${self}${selected ? `?address=${encodeURIComponent(selected.id)}` : ""}`} className="text-sm text-gray-600 hover:underline">
                      Cancelar
                    </Link>
                  )}
                </div>
                <AddressForm action={checkoutAddAddressAction.bind(null, merchant.id)} submitLabel="Guardar y usar esta dirección" initial={{ contactName: actor.name ?? "" }} />
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">2. Contacto y pago</h2>
            <CheckoutForm
              action={checkoutAction.bind(null, merchant.id)}
              idempotencyKey={idempotencyKey}
              addressId={selected?.id ?? ""}
              defaultName={selected?.contactName || actor.name || ""}
              defaultPhone={selected?.contactPhone ?? ""}
              merchantName={merchant.name}
              totalLabel={formatARS(totals.total)}
              blockers={blockers}
            />
          </Card>
        </div>

        <aside>
          <Card className="space-y-3 p-4 lg:sticky lg:top-24">
            <h2 className="font-semibold">Tu pedido</h2>
            <ul className="divide-y divide-gray-100 text-sm">
              {lines.map((l) => (
                <li key={l.itemId} className="flex justify-between gap-2 py-2">
                  <span className="min-w-0">
                    {l.quantity} × {l.productName}
                    {l.variantName !== "Única" && <span className="text-gray-500"> ({l.variantName})</span>}
                    {l.problem && <span className="block text-xs font-medium text-red-600">⚠ {l.problem}</span>}
                  </span>
                  <span className="shrink-0 font-medium">{formatARS(l.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-gray-200 pt-3 text-sm">
              {totals.discountTotal.greaterThan(0) && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Descuentos promo</dt>
                  <dd>−{formatARS(totals.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-600">Subtotal</dt>
                <dd>{formatARS(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Envío</dt>
                <dd>{zone ? (totals.shippingFee.isZero() ? "Gratis" : formatARS(totals.shippingFee)) : "—"}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatARS(totals.total)}</dd>
              </div>
            </dl>
            {!zone && <p className="text-xs text-gray-500">El total no incluye envío hasta que elijas una dirección dentro de la zona de entrega.</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
