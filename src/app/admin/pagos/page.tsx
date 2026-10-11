import Link from "next/link";
import type { PaymentStatus } from "@prisma/client";
import { listPaymentEvents, listPayments } from "@/server/services/platform";
import { formatARS } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/time";
import { Badge, EmptyState, PageTitle, SimulatedBadge, Table, Td } from "@/components/ui";
import { requireAdminPage } from "../_auth";
import { Pagination, pageParam, type SearchParams } from "../_shared";

export const metadata = { title: "Pagos" };

const STATUS: Record<PaymentStatus, { label: string; tone: "gray" | "amber" | "green" | "red" | "blue" }> = {
  PENDING: { label: "Pendiente", tone: "amber" },
  IN_PROCESS: { label: "En proceso", tone: "amber" },
  APPROVED: { label: "Aprobado", tone: "green" },
  REJECTED: { label: "Rechazado", tone: "red" },
  CANCELLED: { label: "Cancelado", tone: "gray" },
  REFUNDED: { label: "Reembolsado", tone: "blue" },
  PARTIALLY_REFUNDED: { label: "Reembolso parcial", tone: "blue" },
  CHARGED_BACK: { label: "Contracargo", tone: "red" },
};

export default async function AdminPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireAdminPage("/admin/pagos");
  const sp = await searchParams;
  const page = pageParam(sp);
  const epage = pageParam(sp, "epage");
  const [payments, events] = await Promise.all([listPayments(actor, page), listPaymentEvents(actor, epage)]);

  return (
    <div className="space-y-8">
      <PageTitle title="Pagos" subtitle="Pagos de todos los comercios y notificaciones recibidas de Mercado Pago." />

      <section aria-labelledby="sec-pagos" className="space-y-3">
        <h2 id="sec-pagos" className="text-lg font-semibold text-gray-900">Pagos</h2>
        {payments.rows.length === 0 ? (
          <EmptyState icon="💳" title="Todavía no hay pagos" />
        ) : (
          <>
            <Table head={["Fecha", "Pedido", "Comercio", "Proveedor", "Id de pago", "Estado", "Monto"]}>
              {payments.rows.map((p) => (
                <tr key={p.id} className={p.isSimulated ? "bg-red-50/40" : undefined}>
                  <Td>{formatDateTimeAR(p.createdAt)}</Td>
                  <Td>
                    <Link href={`/admin/pedidos/${p.order.id}`} className="font-semibold text-brand-700 hover:underline">
                      #{p.order.number}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/admin/comercios/${p.merchantId}`} className="hover:underline">
                      {p.order.merchantNameSnapshot}
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1">
                      {p.provider === "MERCADOPAGO" ? "Mercado Pago" : "Demo"}
                      {p.isSimulated && <SimulatedBadge />}
                    </span>
                  </Td>
                  <Td className="font-mono text-xs">{p.providerPaymentId ?? "—"}</Td>
                  <Td>
                    <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                    {p.statusDetail && <span className="block text-xs text-gray-500">{p.statusDetail}</span>}
                  </Td>
                  <Td className="font-semibold">{formatARS(p.amount)}</Td>
                </tr>
              ))}
            </Table>
            <Pagination base="/admin/pagos" params={{ epage }} page={payments.page} pages={payments.pages} total={payments.total} />
          </>
        )}
      </section>

      <section aria-labelledby="sec-eventos" className="space-y-3">
        <h2 id="sec-eventos" className="text-lg font-semibold text-gray-900">Notificaciones de pago (webhooks)</h2>
        <p className="text-sm text-gray-600">Por seguridad solo se muestran metadatos (tema e id del recurso), nunca el contenido completo de la notificación.</p>
        {events.rows.length === 0 ? (
          <EmptyState icon="📨" title="Sin notificaciones recibidas" />
        ) : (
          <>
            <Table head={["Recibida", "Clave", "Tema", "Recurso", "Firma", "Procesada", "Error"]}>
              {events.rows.map((e) => (
                <tr key={e.id}>
                  <Td>{formatDateTimeAR(e.createdAt)}</Td>
                  <Td className="max-w-56 truncate font-mono text-xs" title={e.eventKey}>
                    {e.eventKey}
                  </Td>
                  <Td>{e.topic ?? "—"}</Td>
                  <Td className="font-mono text-xs">{e.resourceId ?? "—"}</Td>
                  <Td>{e.signatureOk ? <Badge tone="green">Válida</Badge> : <Badge tone="amber">Sin verificar</Badge>}</Td>
                  <Td>{e.processedAt ? formatDateTimeAR(e.processedAt) : <Badge tone="amber">Pendiente</Badge>}</Td>
                  <Td className="min-w-48 whitespace-normal text-xs text-red-700">{e.error ?? <span className="text-gray-400">—</span>}</Td>
                </tr>
              ))}
            </Table>
            <Pagination base="/admin/pagos" params={{ page }} pageKey="epage" page={events.page} pages={events.pages} total={events.total} />
          </>
        )}
      </section>
    </div>
  );
}
