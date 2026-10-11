import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { getActor } from "@/server/authz";
import { getOrderForCustomer } from "@/server/services/orders";
import { demoPaymentsEnabled, syncMercadoPagoPayment } from "@/server/services/payments";
import { getPaymentAccountStatus } from "@/server/services/paymentAccounts";
import { ACTIVE_STATUSES, ORDER_STATUS_LABEL } from "@/server/domain/orderStatus";
import { cancelOrderAction, payOrderAction, retryPaymentAction, simulatePaymentAction } from "@/app/actions/customer";
import { ActionButton } from "@/components/forms";
import { Alert, Badge, Card, PageTitle, ProductImage, SimulatedBadge, StatusBadge } from "@/components/ui";
import { AutoRefresh } from "@/components/public/auto-refresh";
import { etaLabel } from "@/components/public/format";
import { NotFoundError } from "@/lib/errors";
import { formatARS } from "@/lib/money";
import { AR_TZ, formatDateTimeAR } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Detalle del pedido" };

type SP = { mp?: string; payment_id?: string; collection_id?: string; pago?: string };

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  PARTIALLY_REFUNDED: "Reembolsado parcialmente",
  CHARGED_BACK: "Contracargo",
  IN_PROCESS: "En proceso",
};

const PAYMENT_TONE: Record<PaymentStatus, "gray" | "amber" | "green" | "red"> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "gray",
  REFUNDED: "gray",
  PARTIALLY_REFUNDED: "amber",
  CHARGED_BACK: "red",
  IN_PROCESS: "amber",
};

const DELIVERY_STATUSES: OrderStatus[] = ["COURIER_ASSIGNED", "ON_THE_WAY"];

function timeAR(d: Date) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: AR_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

async function loadOrder(actor: NonNullable<Awaited<ReturnType<typeof getActor>>>, id: string) {
  try {
    return await getOrderForCustomer(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const actor = await getActor();
  if (!actor) redirect(`/ingresar?callbackUrl=${encodeURIComponent(`/pedidos/${id}`)}`);

  let order = await loadOrder(actor, id);

  // Regreso desde Mercado Pago: el id que trae el navegador es solo una pista; el servicio lo verifica
  // contra la API de MP (cuenta del comercio y external_reference) antes de aplicar cualquier cambio.
  const rawPaymentId = sp.payment_id || sp.collection_id;
  let syncFailed = false;
  if (sp.mp && typeof rawPaymentId === "string" && /^\d{1,30}$/.test(rawPaymentId)) {
    try {
      await syncMercadoPagoPayment(order.merchantId, rawPaymentId);
      order = await loadOrder(actor, id);
    } catch {
      syncFailed = true;
    }
  }

  const account = order.status === "PENDING_PAYMENT" ? await getPaymentAccountStatus(order.merchantId) : null;
  const hasMp = !!account && account.status !== "REVOKED";
  const demoMode = order.status === "PENDING_PAYMENT" && !hasMp && demoPaymentsEnabled();
  const cannotPay = order.status === "PENDING_PAYMENT" && !hasMp && !demoMode;

  const itemCount = order.items.reduce((a, i) => a + i.quantity, 0);
  const eta = etaLabel(order.etaMinMinutes, order.etaMaxMinutes);
  const canCancel = order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_REJECTED" || order.status === "PAID";
  const live = order.status === "PENDING_PAYMENT" || ACTIVE_STATUSES.includes(order.status) || order.status === "REFUND_PENDING";
  const reservationActive = order.reservationExpiresAt && order.reservationExpiresAt > new Date();
  const courier = order.delivery?.courier;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageTitle
        title={`Pedido #${order.number}`}
        subtitle={
          <>
            {order.merchant.name} · {formatDateTimeAR(order.createdAt)} ·{" "}
            <Link href="/pedidos" className="font-medium text-brand-700 hover:underline">
              Mis pedidos
            </Link>
          </>
        }
        actions={<StatusBadge status={order.status} />}
      />

      {sp.pago === "error" && order.status === "PENDING_PAYMENT" && (
        <Alert tone="error">
          Tu pedido quedó creado y el stock reservado, pero no pudimos iniciar el pago con Mercado Pago.{" "}
          {cannotPay ? `${order.merchant.name} todavía no tiene Mercado Pago conectado.` : "Probá de nuevo con el botón “Pagar con Mercado Pago”."} Si no se paga antes del
          vencimiento de la reserva, el pedido se cancela solo.
        </Alert>
      )}
      {sp.mp === "failure" && order.status !== "PAID" && <Alert tone="error">Mercado Pago informó que el pago no se completó.</Alert>}
      {sp.mp === "pending" && order.status === "PENDING_PAYMENT" && <Alert tone="warning">Tu pago está pendiente de acreditación. Te avisamos acá apenas se confirme.</Alert>}
      {sp.mp === "success" && order.status === "PENDING_PAYMENT" && <Alert tone="info">Estamos confirmando tu pago con Mercado Pago. Puede demorar unos segundos.</Alert>}
      {syncFailed && <Alert tone="warning">Todavía no pudimos verificar el pago con Mercado Pago. El estado se actualiza automáticamente en cuanto se confirme.</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Acciones según estado */}
          {order.status === "PENDING_PAYMENT" && (
            <Card className="space-y-3 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Pago pendiente</h2>
              {order.reservationExpiresAt && (
                <p className="text-sm text-gray-700">
                  {reservationActive ? (
                    <>
                      Tu reserva de stock vence a las <strong>{timeAR(order.reservationExpiresAt)}</strong>. Si no se paga antes, el pedido se cancela.
                    </>
                  ) : (
                    "La reserva de stock venció. Si no se registró un pago, el pedido se va a cancelar."
                  )}
                </p>
              )}
              {hasMp && (
                <ActionButton action={payOrderAction.bind(null, order.id)} variant="primary" pendingText="Redirigiendo a Mercado Pago…">
                  Pagar con Mercado Pago
                </ActionButton>
              )}
              {cannotPay && <Alert tone="warning">{order.merchant.name} todavía no tiene Mercado Pago conectado, así que por ahora no se puede pagar este pedido. Podés cancelarlo.</Alert>}
              {demoMode && (
                <div className="space-y-3 rounded-xl border-2 border-yellow-400 bg-yellow-50 p-4 text-sm text-yellow-900">
                  <p className="font-bold">Modo demostración — pago SIMULADO, no es un cobro real</p>
                  <p>Este comercio no tiene Mercado Pago conectado. En este entorno de prueba podés simular el resultado del pago.</p>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton action={simulatePaymentAction.bind(null, order.id, "approved")} variant="primary" pendingText="Simulando…">
                      Simular pago aprobado
                    </ActionButton>
                    <ActionButton action={simulatePaymentAction.bind(null, order.id, "rejected")} variant="danger" pendingText="Simulando…">
                      Simular pago rechazado
                    </ActionButton>
                  </div>
                </div>
              )}
            </Card>
          )}

          {order.status === "PAYMENT_REJECTED" && (
            <Card className="space-y-3 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">El pago fue rechazado</h2>
              <p className="text-sm text-gray-700">Podés reintentar el pago (volvemos a reservar el stock) o cancelar el pedido.</p>
              <ActionButton action={retryPaymentAction.bind(null, order.id)} variant="primary" pendingText="Preparando el pago…">
                Reintentar pago
              </ActionButton>
            </Card>
          )}

          {(order.status === "CANCELLED" || order.status === "REFUND_PENDING" || order.status === "REFUNDED") && order.cancelReason && (
            <Alert tone="info">Motivo: {order.cancelReason}</Alert>
          )}
          {order.status === "REFUND_PENDING" && <Alert tone="warning">Estamos procesando el reembolso de tu pago a través de Mercado Pago.</Alert>}

          <Card className="p-4 sm:p-5">
            <h2 className="mb-4 text-lg font-semibold">Seguimiento</h2>
            <ol className="relative space-y-4 border-l-2 border-brand-100 pl-5">
              {order.statusHistory.map((h, i) => (
                <li key={h.id} className="relative">
                  <span
                    className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ${i === order.statusHistory.length - 1 ? "bg-brand-600 ring-4 ring-brand-100" : "bg-brand-200"}`}
                    aria-hidden
                  />
                  <p className="font-medium text-gray-900">{ORDER_STATUS_LABEL[h.toStatus]}</p>
                  <p className="text-xs text-gray-500">{formatDateTimeAR(h.createdAt)}</p>
                  {h.note && <p className="text-sm text-gray-600">{h.note}</p>}
                </li>
              ))}
            </ol>
            {live && (
              <div className="mt-4 space-y-1 border-t border-gray-100 pt-3">
                <AutoRefresh seconds={15} />
                {DELIVERY_STATUSES.includes(order.status) && <p className="text-xs text-gray-500">Seguimiento en tiempo real: próximamente.</p>}
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-semibold">
              Productos <span className="text-sm font-normal text-gray-500">({itemCount})</span>
            </h2>
            <ul className="divide-y divide-gray-100">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3">
                  <ProductImage src={it.imageUrl} alt={it.productName} className="h-14 w-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-gray-900">{it.productName}</p>
                    {it.variantName !== "Única" && <p className="text-xs text-gray-500">{it.variantName}</p>}
                    <p className="text-gray-600">
                      {it.quantity} × {formatARS(it.unitPrice)}
                    </p>
                  </div>
                  <p className="font-semibold">{formatARS(it.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-sm">
              {order.discountTotal.greaterThan(0) && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Descuentos promo (incluidos)</dt>
                  <dd>−{formatARS(order.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-600">Subtotal</dt>
                <dd>{formatARS(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Envío{order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ""}</dt>
                <dd>{order.shippingFee.isZero() ? "Gratis" : formatARS(order.shippingFee)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatARS(order.total)}</dd>
              </div>
            </dl>
          </Card>

          {canCancel && (
            <Card className="space-y-2 p-4 sm:p-5">
              <h2 className="font-semibold">¿Querés cancelar el pedido?</h2>
              <p className="text-sm text-gray-600">
                {order.status === "PAID"
                  ? "Tu pago ya fue aprobado. Si lo cancelás antes de que el comercio empiece a prepararlo, pedimos el reembolso total a Mercado Pago; el dinero vuelve al mismo medio de pago en los plazos de Mercado Pago."
                  : "Todavía no pagaste: si lo cancelás, liberamos el stock reservado y no se te cobra nada."}
              </p>
              <ActionButton
                action={cancelOrderAction.bind(null, order.id)}
                variant="danger"
                pendingText="Cancelando…"
                confirm={order.status === "PAID" ? "¿Cancelar el pedido y pedir el reembolso del pago?" : "¿Seguro que querés cancelar este pedido?"}
              >
                Cancelar pedido
              </ActionButton>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="space-y-2 p-4 text-sm">
            <h2 className="font-semibold">Entrega</h2>
            <p className="text-gray-700">
              {order.shipStreet} {order.shipStreetNumber}
              {order.shipApartment ? `, ${order.shipApartment}` : ""}
              <br />
              {order.shipCity}, {order.shipProvince} (CP {order.shipPostalCode})
            </p>
            {order.shipInstructions && <p className="text-gray-600">Indicaciones: {order.shipInstructions}</p>}
            <p className="text-gray-600">
              Recibe: {order.contactName} · {order.contactPhone}
            </p>
            {eta && <p className="text-gray-600">Demora estimada: {eta} desde que el comercio lo despacha</p>}
          </Card>

          <Card className="space-y-2 p-4 text-sm">
            <h2 className="font-semibold">Repartidor</h2>
            {courier ? (
              <>
                <p className="text-gray-900">{courier.name}</p>
                {courier.phone && (
                  <a href={`tel:${courier.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-brand-700 hover:underline">
                    📞 {courier.phone}
                  </a>
                )}
              </>
            ) : (
              <p className="text-gray-600">Todavía no hay un repartidor asignado.</p>
            )}
          </Card>

          <Card className="space-y-2 p-4 text-sm">
            <h2 className="font-semibold">Comercio</h2>
            <Link href={`/comercios/${order.merchant.slug}`} className="font-medium text-brand-700 hover:underline">
              {order.merchant.name}
            </Link>
            {order.merchant.street && (
              <p className="text-gray-600">
                {order.merchant.street} {order.merchant.streetNumber ?? ""}
                {order.merchant.city ? `, ${order.merchant.city}` : ""}
              </p>
            )}
            {order.merchant.phone && (
              <a href={`tel:${order.merchant.phone.replace(/[^\d+]/g, "")}`} className="block font-medium text-brand-700 hover:underline">
                📞 {order.merchant.phone}
              </a>
            )}
          </Card>

          <Card className="space-y-2 p-4 text-sm">
            <h2 className="font-semibold">Pagos</h2>
            {order.payments.length === 0 ? (
              <p className="text-gray-600">Todavía no hay pagos registrados.</p>
            ) : (
              <ul className="space-y-2">
                {order.payments.map((p) => (
                  <li key={p.id} className="rounded-lg bg-gray-50 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.provider === "DEMO" ? "Demo" : "Mercado Pago"}</span>
                      <Badge tone={PAYMENT_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                      {p.isSimulated && <SimulatedBadge />}
                    </div>
                    <p className="text-gray-600">
                      {formatARS(p.amount)} · {formatDateTimeAR(p.createdAt)}
                    </p>
                    {p.refunds.length > 0 && (
                      <p className="text-xs text-gray-500">
                        Reembolsos: {p.refunds.map((r) => `${formatARS(r.amount)} (${r.status === "APPROVED" ? "aprobado" : r.status === "REJECTED" ? "rechazado" : "pendiente"})`).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
