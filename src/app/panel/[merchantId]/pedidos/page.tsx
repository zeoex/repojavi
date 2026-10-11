import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { formatARS } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/time";
import { listOrdersForMerchant } from "@/server/services/orders";
import { ORDER_STATUS_LABEL } from "@/server/domain/orderStatus";
import { EmptyState, PageTitle, SimulatedBadge, StatusBadge, Table, Td, cx } from "@/components/ui";
import { requireMerchantPage } from "../../_lib/guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos" };

const CHIPS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  { label: "Pendientes de pago", value: "PENDING_PAYMENT" },
  { label: "A preparar", value: "PAID" },
  { label: "En preparación", value: "PREPARING" },
  { label: "Listos", value: "READY" },
  { label: "En reparto", value: "COURIER_ASSIGNED,ON_THE_WAY" },
  { label: "Entregados", value: "DELIVERED" },
  { label: "Cancelados / rechazados", value: "CANCELLED,PAYMENT_REJECTED" },
  { label: "Reembolsos", value: "REFUND_PENDING,REFUNDED" },
];

function parseStatuses(raw: string | undefined): OrderStatus[] {
  if (!raw) return [];
  return raw.split(",").filter((s): s is OrderStatus => s in ORDER_STATUS_LABEL);
}

export default async function MerchantOrdersPage({ params, searchParams }: { params: Promise<{ merchantId: string }>; searchParams: Promise<{ estado?: string }> }) {
  const { merchantId } = await params;
  const actor = await requireMerchantPage(merchantId, "/pedidos");
  const sp = await searchParams;
  const statuses = parseStatuses(typeof sp.estado === "string" ? sp.estado : undefined);
  const current = statuses.join(",");
  const orders = await listOrdersForMerchant(actor, merchantId, { status: statuses, take: 200 });
  const base = `/panel/${merchantId}/pedidos`;

  return (
    <div className="space-y-6">
      <PageTitle title="Pedidos" subtitle="Se muestran los últimos 200 pedidos. Para períodos anteriores descargá el CSV en Reportes." />
      <nav aria-label="Filtrar por estado" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2 whitespace-nowrap pb-1">
          {CHIPS.map((c) => {
            const active = c.value === current;
            return (
              <li key={c.label}>
                <Link
                  href={c.value ? `${base}?estado=${c.value}` : base}
                  aria-current={active ? "true" : undefined}
                  className={cx(
                    "inline-block rounded-full border px-3 py-1.5 text-sm font-medium transition",
                    active ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {orders.length === 0 ? (
        <EmptyState icon="🧾" title="No hay pedidos" description={current ? "No hay pedidos con este estado." : "Cuando tus clientes compren, los pedidos van a aparecer acá."} />
      ) : (
        <Table head={["Pedido", "Fecha", "Cliente", "Total", "Estado", "Repartidor", ""]}>
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-gray-50">
              <Td className="font-semibold">
                <Link href={`${base}/${o.id}`} className="text-brand-700 hover:underline">
                  #{o.number}
                </Link>
              </Td>
              <Td>{formatDateTimeAR(o.createdAt)}</Td>
              <Td className="max-w-[12rem] truncate">{o.contactName}</Td>
              <Td>
                {formatARS(o.total)}
                <span className="block text-xs text-gray-500">{o.items.reduce((a, i) => a + i.quantity, 0)} u.</span>
              </Td>
              <Td>
                <StatusBadge status={o.status} />
              </Td>
              <Td>{o.delivery?.courier?.name ?? <span className="text-gray-400">—</span>}</Td>
              <Td>{o.payments.some((p) => p.isSimulated) && <SimulatedBadge />}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
