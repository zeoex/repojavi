import Link from "next/link";
import { notFound } from "next/navigation";
import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { formatARS } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/time";
import { getOrderForMerchant } from "@/server/services/orders";
import { listCouriers } from "@/server/services/couriers";
import { ORDER_STATUS_LABEL, nextStatusesFor } from "@/server/domain/orderStatus";
import { assignCourierAction, retryRefundAction, unassignCourierAction, updateOrderStatusAction } from "@/app/actions/merchant";
import { ActionButton } from "@/components/forms";
import { FieldsForm } from "../../../_components/fields-form";
import { Alert, Badge, Card, PageTitle, ProductImage, SimulatedBadge, StatusBadge, Table, Td } from "@/components/ui";
import { requireMerchantPage } from "../../../_lib/guard";
import { ReasonActionForm } from "./reason-action-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detalle del pedido" };

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  PARTIALLY_REFUNDED: "Reembolso parcial",
  CHARGED_BACK: "Contracargo",
  IN_PROCESS: "En proceso",
};

const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  PENDING_ASSIGNMENT: "Sin repartidor",
  ASSIGNED: "Asignada",
  ACCEPTED: "Aceptada por el repartidor",
  PICKED_UP: "Retirada del local",
  DELIVERED: "Entregada",
  FAILED: "Entrega fallida",
  CANCELLED: "Cancelada",
};

const ACTOR_LABEL: Record<string, string> = { SYSTEM: "Sistema", CUSTOMER: "Cliente", MERCHANT: "Comercio", COURIER: "Repartidor", SUPERADMIN: "Plataforma", WEBHOOK: "Mercado Pago", USER: "Usuario" };

function simpleLabel(from: OrderStatus, to: OrderStatus) {
  if (to === "PREPARING") return "Empezar preparación";
  if (to === "READY") return "Marcar listo";
  if (to === "ON_THE_WAY") return "Salió a reparto";
  if (to === "DELIVERED") return from === "READY" ? "Entregado (retiro en local)" : "Marcar entregado";
  return ORDER_STATUS_LABEL[to];
}

export default async function MerchantOrderDetailPage({ params }: { params: Promise<{ merchantId: string; orderId: string }> }) {
  const { merchantId, orderId } = await params;
  const actor = await requireMerchantPage(merchantId, `/pedidos/${orderId}`);
  let order;
  try {
    order = await getOrderForMerchant(actor, merchantId, orderId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const couriers = order.status === "READY" ? (await listCouriers(actor, merchantId)).filter((c) => c.active) : [];

  const next = nextStatusesFor(order.status, actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "MERCHANT");
  // COURIER_ASSIGNED y REFUNDED tienen flujos propios; READY desde reparto se maneja con "Desasignar".
  const simple = next.filter((s) => ["PREPARING", "ON_THE_WAY", "DELIVERED"].includes(s) || (s === "READY" && order.status === "PREPARING"));
  const canCancel = next.includes("CANCELLED");
  const canRefund = next.includes("REFUND_PENDING");
  const simulated = order.payments.some((p) => p.isSimulated);
  const base = `/panel/${merchantId}/pedidos`;
  const items = order.items.reduce((a, i) => a + i.quantity, 0);

  return (
    <div className="space-y-6">
      <Link href={base} className="text-sm font-medium text-brand-700 hover:underline">
        ← Volver a pedidos
      </Link>
      <PageTitle
        title={`Pedido #${order.number}`}
        subtitle={`Creado el ${formatDateTimeAR(order.createdAt)} · ${items} ${items === 1 ? "unidad" : "unidades"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            {simulated && <SimulatedBadge />}
          </div>
        }
      />

      {simulated && <Alert tone="warning">Este pedido se pagó con un PAGO SIMULADO de demostración: no se cobró dinero real.</Alert>}
      {order.cancelReason && (
        <Alert tone="info">
          <strong>Motivo de cancelación:</strong> {order.cancelReason}
        </Alert>
      )}

      {/* Acciones */}
      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Acciones</h2>
        {simple.length === 0 && !canCancel && !canRefund && order.status !== "READY" && order.status !== "COURIER_ASSIGNED" && order.status !== "REFUND_PENDING" && (
          <p className="text-sm text-gray-600">
            No hay acciones disponibles para este estado.
          </p>
        )}
        {simple.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {simple.map((to) => (
              <ActionButton key={to} action={updateOrderStatusAction.bind(null, merchantId, order.id, to)} variant="primary" pendingText="Guardando…">
                {simpleLabel(order.status, to)}
              </ActionButton>
            ))}
          </div>
        )}
        {order.status === "PENDING_PAYMENT" && <p className="text-sm text-gray-600">Esperando el pago del cliente. Cuando Mercado Pago lo confirme vas a poder prepararlo.</p>}

        {order.status === "READY" && (
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <h3 className="font-semibold">Asignar repartidor</h3>
            {couriers.length === 0 ? (
              <p className="text-sm text-gray-600">
                No tenés repartidores activos.{" "}
                <Link href={`/panel/${merchantId}/repartidores`} className="font-medium text-brand-700 hover:underline">
                  Dar de alta un repartidor
                </Link>
              </p>
            ) : (
              <FieldsForm
                action={assignCourierAction.bind(null, merchantId, order.id)}
                idPrefix="assign"
                columns={1}
                inline
                submitLabel="Asignar"
                pendingText="Asignando…"
                fields={[
                  {
                    name: "courierId",
                    label: "Repartidor",
                    type: "select",
                    required: true,
                    defaultValue: "",
                    options: [
                      { value: "", label: "Elegí un repartidor…", disabled: true },
                      ...couriers.map((c) => ({
                        value: c.id,
                        label: `${c.name}${c.vehicle ? ` (${c.vehicle})` : ""}${c._count.deliveries ? ` · ${c._count.deliveries} en curso` : ""}${!c.userId ? " · sin cuenta vinculada" : ""}`,
                      })),
                    ],
                  },
                ]}
              />
            )}
          </div>
        )}

        {order.status === "COURIER_ASSIGNED" && (
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            <p className="text-sm text-gray-700">
              Repartidor asignado: <strong>{order.delivery?.courier?.name ?? "—"}</strong>
            </p>
            <ActionButton action={unassignCourierAction.bind(null, merchantId, order.id)} confirm="¿Desasignar al repartidor? El pedido vuelve a “Listo para entregar”." pendingText="Desasignando…">
              Desasignar
            </ActionButton>
          </div>
        )}

        {order.status === "REFUND_PENDING" && (
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <p className="text-sm text-gray-700">
              El reembolso está pendiente de confirmación de Mercado Pago. Si falló (por ejemplo, porque se desconectó tu cuenta), podés reintentarlo.
            </p>
            <ActionButton action={retryRefundAction.bind(null, merchantId, order.id)} variant="primary" pendingText="Solicitando…">
              Reintentar reembolso
            </ActionButton>
          </div>
        )}

        {(canCancel || canRefund) && (
          <div className="border-t border-gray-100 pt-4">
            {canCancel ? (
              <ReasonActionForm
                action={updateOrderStatusAction.bind(null, merchantId, order.id, "CANCELLED")}
                label="Cancelar pedido"
                explanation="El pedido todavía no está pagado: se cancela y se liberan las unidades reservadas."
                confirm="¿Cancelar este pedido? Esta acción no se puede deshacer."
              />
            ) : (
              <ReasonActionForm
                action={updateOrderStatusAction.bind(null, merchantId, order.id, "REFUND_PENDING")}
                label={order.status === "DELIVERED" ? "Reembolsar pedido" : "Cancelar y reembolsar"}
                explanation={
                  order.status === "DELIVERED"
                    ? `Se devuelve el total (${formatARS(order.total)}) al cliente a través de Mercado Pago${simulated ? " (reembolso simulado)" : ""}. La mercadería ya entregada NO vuelve al stock automáticamente.`
                    : `El pedido ya está pagado: se cancela, se devuelve el total (${formatARS(order.total)}) al cliente a través de Mercado Pago${simulated ? " (reembolso simulado)" : ""} y las unidades vuelven al stock.`
                }
                confirm="¿Cancelar y reembolsar este pedido? Se le devuelve el dinero al cliente y no se puede deshacer."
              />
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section aria-labelledby="items" className="space-y-3">
            <h2 id="items" className="text-lg font-semibold">Productos</h2>
            <Table head={["", "Producto", "SKU", "Cant.", "Precio", "Subtotal"]}>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <Td className="w-14">
                    <ProductImage src={i.imageUrl} alt={i.productName} className="h-10 w-10 rounded-lg text-lg" />
                  </Td>
                  <Td className="whitespace-normal">
                    <span className="font-medium">{i.productName}</span>
                    {i.variantName !== "Única" && <span className="block text-xs text-gray-500">{i.variantName}</span>}
                  </Td>
                  <Td className="font-mono text-xs">{i.sku}</Td>
                  <Td>{i.quantity}</Td>
                  <Td>{formatARS(i.unitPrice)}</Td>
                  <Td>{formatARS(i.lineTotal)}</Td>
                </tr>
              ))}
            </Table>
            <Card className="ml-auto max-w-sm space-y-1 p-4 text-sm">
              <Row label="Subtotal" value={formatARS(order.subtotal)} />
              {!order.discountTotal.isZero() && <Row label="Descuentos" value={`− ${formatARS(order.discountTotal)}`} />}
              <Row label={`Envío${order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ""}`} value={formatARS(order.shippingFee)} />
              <div className="border-t border-gray-200 pt-1">
                <Row label="Total" value={formatARS(order.total)} strong />
              </div>
            </Card>
          </section>

          <section aria-labelledby="pagos" className="space-y-3">
            <h2 id="pagos" className="text-lg font-semibold">Pagos</h2>
            <Table
              head={["Fecha", "Proveedor", "Id de pago", "Estado", "Monto", "Reembolsos"]}
              empty={order.payments.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">Todavía no hay pagos registrados.</p> : undefined}
            >
              {order.payments.map((p) => (
                <tr key={p.id}>
                  <Td>{formatDateTimeAR(p.createdAt)}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      {p.provider === "MERCADOPAGO" ? "Mercado Pago" : "Demo"}
                      {p.isSimulated && <SimulatedBadge />}
                    </span>
                  </Td>
                  <Td className="font-mono text-xs">{p.providerPaymentId ?? "—"}</Td>
                  <Td>
                    {PAYMENT_STATUS_LABEL[p.status]}
                    {p.statusDetail && <span className="block text-xs text-gray-500">{p.statusDetail}</span>}
                  </Td>
                  <Td>{formatARS(p.amount)}</Td>
                  <Td className="whitespace-normal">
                    {p.refunds.length === 0
                      ? "—"
                      : p.refunds.map((r) => (
                          <span key={r.id} className="block text-xs">
                            {formatARS(r.amount)} · {r.status === "APPROVED" ? "Aprobado" : r.status === "PENDING" ? "Pendiente" : "Rechazado"}
                          </span>
                        ))}
                  </Td>
                </tr>
              ))}
            </Table>
          </section>

          <section aria-labelledby="historial" className="space-y-3">
            <h2 id="historial" className="text-lg font-semibold">Historial de estados</h2>
            <Card className="p-4">
              <ol className="space-y-3">
                {order.statusHistory.map((h) => (
                  <li key={h.id} className="flex flex-col gap-1 border-l-2 border-brand-200 pl-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <StatusBadge status={h.toStatus} />
                      <span className="ml-2 text-gray-600">
                        {ACTOR_LABEL[h.actorType] ?? h.actorType}
                        {h.actor ? ` · ${h.actor.name ?? h.actor.email}` : ""}
                      </span>
                      {h.note && <p className="mt-1 text-gray-700">{h.note}</p>}
                    </div>
                    <time className="shrink-0 text-xs text-gray-500" dateTime={h.createdAt.toISOString()}>
                      {formatDateTimeAR(h.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          <Card className="space-y-2 p-4 text-sm">
            <h2 className="text-base font-semibold">Entrega</h2>
            <p>
              {order.shipStreet} {order.shipStreetNumber}
              {order.shipApartment ? `, ${order.shipApartment}` : ""}
            </p>
            <p>
              {order.shipCity}, {order.shipProvince} ({order.shipPostalCode})
            </p>
            {order.etaMinMinutes != null && order.etaMaxMinutes != null && (
              <p className="text-gray-600">
                Demora estimada: {order.etaMinMinutes}–{order.etaMaxMinutes} min
              </p>
            )}
            {order.shipInstructions && (
              <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
                <strong>Indicaciones:</strong> {order.shipInstructions}
              </p>
            )}
          </Card>
          <Card className="space-y-2 p-4 text-sm">
            <h2 className="text-base font-semibold">Contacto</h2>
            <p className="font-medium">{order.contactName}</p>
            <p>
              <a href={`tel:${order.contactPhone.replace(/[^\d+]/g, "")}`} className="text-brand-700 hover:underline">
                {order.contactPhone}
              </a>
            </p>
            <p>
              <a href={`mailto:${order.customerEmail}`} className="break-all text-brand-700 hover:underline">
                {order.customerEmail}
              </a>
            </p>
          </Card>
          <Card className="space-y-3 p-4 text-sm">
            <h2 className="text-base font-semibold">Reparto</h2>
            {!order.delivery ? (
              <p className="text-gray-600">Todavía no se asignó un repartidor.</p>
            ) : (
              <>
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone="violet">{DELIVERY_STATUS_LABEL[order.delivery.status]}</Badge>
                  {order.delivery.courier && (
                    <span>
                      {order.delivery.courier.name}
                      {order.delivery.courier.phone && (
                        <>
                          {" · "}
                          <a href={`tel:${order.delivery.courier.phone.replace(/[^\d+]/g, "")}`} className="text-brand-700 hover:underline">
                            {order.delivery.courier.phone}
                          </a>
                        </>
                      )}
                    </span>
                  )}
                </p>
                {order.delivery.notes && <p className="text-gray-700">Nota: {order.delivery.notes}</p>}
                {order.delivery.events.length > 0 && (
                  <ol className="space-y-2">
                    {order.delivery.events.map((ev) => (
                      <li key={ev.id} className="border-l-2 border-gray-200 pl-3">
                        <span className="font-medium">{DELIVERY_STATUS_LABEL[ev.status]}</span>
                        <span className="block text-xs text-gray-500">{formatDateTimeAR(ev.createdAt)}</span>
                        {ev.note && <span className="block text-gray-700">{ev.note}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between font-bold text-gray-900" : "flex justify-between text-gray-700"}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
