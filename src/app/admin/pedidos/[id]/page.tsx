import Link from "next/link";
import { notFound } from "next/navigation";
import type { DeliveryStatus, PaymentStatus } from "@prisma/client";
import { getOrderAdmin } from "@/server/services/platform";
import { ORDER_STATUS_LABEL } from "@/server/domain/orderStatus";
import { NotFoundError } from "@/lib/errors";
import { formatARS } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/time";
import { ActionButton } from "@/components/forms";
import { Alert, Badge, Card, PageTitle, SimulatedBadge, StatusBadge, Table, Td } from "@/components/ui";
import { retryRefundAction } from "@/app/actions/admin";
import { requireAdminPage } from "../../_auth";

export const metadata = { title: "Pedido" };

const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: "gray" | "amber" | "green" | "red" | "blue" }> = {
  PENDING: { label: "Pendiente", tone: "amber" },
  IN_PROCESS: { label: "En proceso", tone: "amber" },
  APPROVED: { label: "Aprobado", tone: "green" },
  REJECTED: { label: "Rechazado", tone: "red" },
  CANCELLED: { label: "Cancelado", tone: "gray" },
  REFUNDED: { label: "Reembolsado", tone: "blue" },
  PARTIALLY_REFUNDED: { label: "Reembolso parcial", tone: "blue" },
  CHARGED_BACK: { label: "Contracargo", tone: "red" },
};

const DELIVERY_STATUS: Record<DeliveryStatus, string> = {
  PENDING_ASSIGNMENT: "Sin repartidor",
  ASSIGNED: "Asignada",
  ACCEPTED: "Aceptada",
  PICKED_UP: "Retirada",
  DELIVERED: "Entregada",
  FAILED: "No se pudo entregar",
  CANCELLED: "Cancelada",
};

const REFUND_STATUS = { PENDING: "Pendiente", APPROVED: "Aprobado", REJECTED: "Rechazado" } as const;

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireAdminPage(`/admin/pedidos/${id}`);
  let o;
  try {
    o = await getOrderAdmin(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const simulated = o.payments.some((p) => p.isSimulated);

  return (
    <div className="space-y-6">
      <Link href="/admin/pedidos" className="text-sm font-semibold text-brand-700 hover:underline">
        ← Volver a pedidos
      </Link>
      <PageTitle
        title={`Pedido #${o.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} />
            {simulated && <SimulatedBadge />}
            <span>Creado el {formatDateTimeAR(o.createdAt)}</span>
          </span>
        }
      />

      {simulated && <Alert tone="error">Este pedido tiene pagos SIMULADOS (modo demostración). No se movió dinero real.</Alert>}

      {o.status === "REFUND_PENDING" && (
        <Card className="space-y-3 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            El reembolso de este pedido está pendiente. Si falló la solicitud a Mercado Pago (por ejemplo, por credenciales vencidas del comercio), podés reintentarla.
          </p>
          <ActionButton action={retryRefundAction.bind(null, o.id)} variant="primary" pendingText="Reintentando…" confirm="¿Reintentar el reembolso de este pedido?">
            Reintentar reembolso
          </ActionButton>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Comercio y cliente</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-gray-500">Comercio</dt>
            <dd>
              <Link href={`/admin/comercios/${o.merchant.id}`} className="text-brand-700 hover:underline">
                {o.merchantNameSnapshot}
              </Link>
            </dd>
            <dt className="font-medium text-gray-500">Cliente</dt>
            <dd>
              {o.contactName} · <span className="break-all">{o.customerEmail}</span>
            </dd>
            <dt className="font-medium text-gray-500">Teléfono</dt>
            <dd>
              <a href={`tel:${o.contactPhone}`} className="text-brand-700 hover:underline">
                {o.contactPhone}
              </a>
            </dd>
            <dt className="font-medium text-gray-500">Entrega en</dt>
            <dd>
              {o.shipStreet} {o.shipStreetNumber}
              {o.shipApartment ? `, ${o.shipApartment}` : ""} — {o.shipCity}, {o.shipProvince} ({o.shipPostalCode})
              {o.shipInstructions && <span className="block text-gray-600">Indicaciones: {o.shipInstructions}</span>}
            </dd>
            <dt className="font-medium text-gray-500">Zona</dt>
            <dd>
              {o.deliveryZoneName ?? "—"}
              {o.etaMinMinutes != null && o.etaMaxMinutes != null && ` · ${o.etaMinMinutes}–${o.etaMaxMinutes} min`}
            </dd>
            {o.cancelReason && (
              <>
                <dt className="font-medium text-gray-500">Motivo de cancelación</dt>
                <dd>{o.cancelReason}</dd>
              </>
            )}
            {o.paidAt && (
              <>
                <dt className="font-medium text-gray-500">Pagado</dt>
                <dd>{formatDateTimeAR(o.paidAt)}</dd>
              </>
            )}
            {o.deliveredAt && (
              <>
                <dt className="font-medium text-gray-500">Entregado</dt>
                <dd>{formatDateTimeAR(o.deliveredAt)}</dd>
              </>
            )}
          </dl>
        </Card>

        <Card className="p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Productos</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span>
                  {i.quantity} × {i.productName}
                  {i.variantName !== "Única" && <span className="text-gray-500"> ({i.variantName})</span>}
                  <span className="block text-xs text-gray-500">
                    SKU {i.sku} · {formatARS(i.unitPrice)} c/u
                  </span>
                </span>
                <span className="font-medium">{formatARS(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatARS(o.subtotal)}</dd>
            </div>
            {!o.discountTotal.isZero() && (
              <div className="flex justify-between text-emerald-700">
                <dt>Descuentos</dt>
                <dd>-{formatARS(o.discountTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Envío</dt>
              <dd>{formatARS(o.shippingFee)}</dd>
            </div>
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt>
              <dd>{formatARS(o.total)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <section className="space-y-3" aria-labelledby="sec-pagos">
        <h2 id="sec-pagos" className="text-lg font-semibold text-gray-900">Pagos</h2>
        {o.payments.length === 0 ? (
          <p className="text-sm text-gray-600">Este pedido no tiene pagos registrados.</p>
        ) : (
          <Table head={["Fecha", "Proveedor", "Id de pago", "Estado", "Monto", "Reembolsos"]}>
            {o.payments.map((p) => (
              <tr key={p.id}>
                <Td>{formatDateTimeAR(p.createdAt)}</Td>
                <Td>
                  <span className="flex items-center gap-1">
                    {p.provider === "MERCADOPAGO" ? "Mercado Pago" : "Demo"}
                    {p.isSimulated && <SimulatedBadge />}
                  </span>
                </Td>
                <Td className="font-mono text-xs">{p.providerPaymentId ?? "—"}</Td>
                <Td>
                  <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                  {p.statusDetail && <span className="block text-xs text-gray-500">{p.statusDetail}</span>}
                </Td>
                <Td className="font-semibold">{formatARS(p.amount)}</Td>
                <Td className="whitespace-normal">
                  {p.refunds.length === 0
                    ? "—"
                    : p.refunds.map((r) => (
                        <span key={r.id} className="block text-xs">
                          {formatARS(r.amount)} · {REFUND_STATUS[r.status]} · {formatDateTimeAR(r.createdAt)}
                        </span>
                      ))}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Historial de estados</h2>
          {o.statusHistory.length === 0 ? (
            <p className="text-sm text-gray-600">Sin cambios registrados.</p>
          ) : (
            <ol className="space-y-3 border-l-2 border-gray-200 pl-4 text-sm">
              {o.statusHistory.map((h) => (
                <li key={h.id}>
                  <p className="font-medium text-gray-900">
                    {h.fromStatus ? `${ORDER_STATUS_LABEL[h.fromStatus]} → ` : ""}
                    {ORDER_STATUS_LABEL[h.toStatus]}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDateTimeAR(h.createdAt)} · {h.actor?.email ?? h.actorType}
                  </p>
                  {h.note && <p className="text-gray-700">{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Entrega</h2>
          {!o.delivery ? (
            <p className="text-sm text-gray-600">Todavía no se generó la entrega.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                <Badge tone="blue">{DELIVERY_STATUS[o.delivery.status]}</Badge>
                <span className="ml-2">
                  {o.delivery.courier ? `Repartidor: ${o.delivery.courier.name}` : "Sin repartidor asignado"}
                  {o.delivery.courier?.phone && (
                    <>
                      {" · "}
                      <a href={`tel:${o.delivery.courier.phone}`} className="text-brand-700 hover:underline">
                        {o.delivery.courier.phone}
                      </a>
                    </>
                  )}
                </span>
              </p>
              {o.delivery.notes && <p className="text-gray-700">Notas: {o.delivery.notes}</p>}
              {o.delivery.events.length > 0 && (
                <ol className="space-y-2 border-l-2 border-gray-200 pl-4">
                  {o.delivery.events.map((e) => (
                    <li key={e.id}>
                      <span className="font-medium">{DELIVERY_STATUS[e.status]}</span>
                      <span className="text-xs text-gray-500"> · {formatDateTimeAR(e.createdAt)}</span>
                      {e.note && <span className="block text-gray-700">{e.note}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
