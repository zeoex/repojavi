import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/authz";
import { getPricedCart, MAX_QTY_PER_LINE } from "@/server/services/cart";
import { clearCartAction, setCartItemQuantityAction } from "@/app/actions/customer";
import { ActionButton } from "@/components/forms";
import { Alert, Button, Card, EmptyState, LinkButton, PageTitle, ProductImage } from "@/components/ui";
import { formatARS } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Carrito" };

export default async function MerchantCartPage({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/ingresar?callbackUrl=${encodeURIComponent(`/carrito/${merchantId}`)}`);
  const priced = await getPricedCart(actor.userId, merchantId);

  if (!priced || priced.lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageTitle title="Carrito" />
        <EmptyState
          title="Este carrito está vacío"
          description="Agregá productos desde la página del comercio."
          action={
            priced ? (
              <LinkButton href={`/comercios/${priced.merchant.slug}`}>Ir a {priced.merchant.name}</LinkButton>
            ) : (
              <LinkButton href="/carrito">Ver mis carritos</LinkButton>
            )
          }
        />
      </div>
    );
  }

  const { merchant, lines, totals } = priced;
  const hasProblems = lines.some((l) => l.problem);
  const minOrder = merchant.settings?.minOrderAmount;
  const belowMin = minOrder && minOrder.greaterThan(0) && totals.subtotal.lessThan(minOrder);

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        title={`Carrito de ${merchant.name}`}
        subtitle={
          <>
            Este pedido se paga y se envía solo con {merchant.name}.{" "}
            <Link href="/carrito" className="font-medium text-brand-700 hover:underline">
              Ver todos mis carritos
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-label="Productos del carrito" className="space-y-3">
          {merchant.salesPaused && <Alert tone="warning">{merchant.name} pausó temporalmente sus ventas. No vas a poder pagar este carrito por ahora.</Alert>}
          {hasProblems && <Alert tone="warning">Algunos productos cambiaron de disponibilidad. Ajustá las cantidades o quitalos para continuar.</Alert>}
          <ul className="space-y-3">
            {lines.map((l) => {
              const maxQty = Math.min(l.available, MAX_QTY_PER_LINE);
              const hasPromo = !l.unitPrice.equals(l.listPrice);
              return (
                <li key={l.itemId}>
                  <Card className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                    <ProductImage src={l.imageUrl} alt={l.productName} className="h-20 w-20 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{l.productName}</p>
                          {l.variantName !== "Única" && <p className="text-xs text-gray-500">Variante: {l.variantName}</p>}
                          <p className="text-sm text-gray-600">
                            {formatARS(l.unitPrice)} c/u
                            {hasPromo && <span className="ml-2 text-xs text-gray-400 line-through">{formatARS(l.listPrice)}</span>}
                          </p>
                        </div>
                        <p className="font-bold text-gray-900">{formatARS(l.lineTotal)}</p>
                      </div>
                      {l.problem && (
                        <p className="text-xs font-medium text-red-600" role="alert">
                          ⚠ {l.problem}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-1" role="group" aria-label={`Cantidad de ${l.productName}`}>
                          <ActionButton action={setCartItemQuantityAction.bind(null, l.itemId, l.quantity - 1)} className="h-9 w-9 px-0" pendingText="">
                            <span aria-hidden>−</span>
                            <span className="sr-only">Restar una unidad</span>
                          </ActionButton>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-label={`${l.quantity} unidades`}>
                            {l.quantity}
                          </span>
                          {l.quantity < maxQty ? (
                            <ActionButton action={setCartItemQuantityAction.bind(null, l.itemId, l.quantity + 1)} className="h-9 w-9 px-0" pendingText="">
                              <span aria-hidden>+</span>
                              <span className="sr-only">Sumar una unidad</span>
                            </ActionButton>
                          ) : (
                            <Button type="button" variant="secondary" disabled className="h-9 w-9 px-0" aria-label="No hay más unidades disponibles">
                              +
                            </Button>
                          )}
                        </div>
                        {l.quantity > l.available && l.available > 0 && (
                          <ActionButton action={setCartItemQuantityAction.bind(null, l.itemId, l.available)} variant="ghost" className="px-2 py-1 text-xs">
                            Ajustar a {l.available}
                          </ActionButton>
                        )}
                        <ActionButton action={setCartItemQuantityAction.bind(null, l.itemId, 0)} variant="ghost" className="px-2 py-1 text-xs text-red-700">
                          Quitar
                        </ActionButton>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <LinkButton href={`/comercios/${merchant.slug}`} variant="secondary">
              Seguir comprando
            </LinkButton>
            <ActionButton action={clearCartAction.bind(null, merchant.id)} variant="ghost" confirm={`¿Vaciar el carrito de ${merchant.name}? Se quitan todos los productos.`}>
              Vaciar carrito
            </ActionButton>
          </div>
        </section>

        <aside>
          <Card className="space-y-3 p-4 lg:sticky lg:top-24">
            <h2 className="font-semibold">Resumen</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Subtotal (precio de lista)</dt>
                <dd>{formatARS(totals.listSubtotal)}</dd>
              </div>
              {totals.discountTotal.greaterThan(0) && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Descuentos promo</dt>
                  <dd>−{formatARS(totals.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <dt>Subtotal</dt>
                <dd>{formatARS(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-gray-600">
                <dt>Envío</dt>
                <dd>se calcula con tu dirección</dd>
              </div>
            </dl>
            {belowMin && <Alert tone="warning">El pedido mínimo de {merchant.name} es {formatARS(minOrder)}.</Alert>}
            {hasProblems || merchant.salesPaused ? (
              <>
                <Button type="button" disabled className="w-full">
                  Continuar al pago
                </Button>
                <p className="text-xs text-gray-600">
                  {merchant.salesPaused ? "El comercio pausó sus ventas." : "Resolvé los avisos de los productos para continuar."}
                </p>
              </>
            ) : (
              <LinkButton href={`/checkout/${merchant.id}`} className="w-full">
                Continuar al pago
              </LinkButton>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
