import Link from "next/link";
import { listAllOrders, listMerchantOptions } from "@/server/services/platform";
import { ORDER_STATUS_LABEL } from "@/server/domain/orderStatus";
import { formatARS } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/time";
import { Alert, Button, Card, EmptyState, Input, LinkButton, PageTitle, Select, SimulatedBadge, StatusBadge, Table, Td } from "@/components/ui";
import { requireAdminPage } from "../_auth";
import { ORDER_STATUSES, Pagination, pageParam, param, parseDayAR, parseOrderStatus, type SearchParams } from "../_shared";

export const metadata = { title: "Pedidos" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireAdminPage("/admin/pedidos");
  const sp = await searchParams;
  const comercio = param(sp, "comercio");
  const estado = param(sp, "estado");
  const desde = param(sp, "desde");
  const hasta = param(sp, "hasta");
  const from = parseDayAR(desde);
  const to = parseDayAR(hasta, true);
  const invalidRange = Boolean(from && to && from > to);

  const [data, merchants] = await Promise.all([
    listAllOrders(actor, {
      merchantId: comercio || undefined,
      status: parseOrderStatus(estado),
      from,
      to: invalidRange ? undefined : to,
      page: pageParam(sp),
    }),
    listMerchantOptions(actor),
  ]);
  const hasFilters = Boolean(comercio || estado || desde || hasta);

  return (
    <div className="space-y-6">
      <PageTitle title="Pedidos" subtitle="Todos los pedidos de la plataforma." />

      <Card className="p-4">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <div className="space-y-1">
            <label htmlFor="comercio" className="block text-sm font-medium text-gray-700">Comercio</label>
            <Select id="comercio" name="comercio" defaultValue={comercio}>
              <option value="">Todos</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.deletedAt ? " (eliminado)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="estado" className="block text-sm font-medium text-gray-700">Estado</label>
            <Select id="estado" name="estado" defaultValue={estado}>
              <option value="">Todos</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="desde" className="block text-sm font-medium text-gray-700">Desde</label>
            <Input id="desde" name="desde" type="date" defaultValue={desde} />
          </div>
          <div className="space-y-1">
            <label htmlFor="hasta" className="block text-sm font-medium text-gray-700">Hasta</label>
            <Input id="hasta" name="hasta" type="date" defaultValue={hasta} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">Filtrar</Button>
            {hasFilters && (
              <LinkButton href="/admin/pedidos" variant="secondary">
                Limpiar
              </LinkButton>
            )}
          </div>
        </form>
        {invalidRange && (
          <div className="mt-3">
            <Alert tone="warning">La fecha &quot;hasta&quot; es anterior a &quot;desde&quot;; se ignoró el límite superior.</Alert>
          </div>
        )}
      </Card>

      {data.rows.length === 0 ? (
        <EmptyState icon="📦" title="No hay pedidos" description={hasFilters ? "Probá cambiando los filtros." : "Todavía no se hizo ningún pedido."} />
      ) : (
        <>
          <Table head={["Pedido", "Fecha", "Comercio", "Cliente", "Estado", "Total"]}>
            {data.rows.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link href={`/admin/pedidos/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                    #{o.number}
                  </Link>
                </Td>
                <Td>{formatDateTimeAR(o.createdAt)}</Td>
                <Td>
                  <Link href={`/admin/comercios/${o.merchantId}`} className="hover:underline">
                    {o.merchantNameSnapshot}
                  </Link>
                </Td>
                <Td>
                  <span className="block">{o.contactName}</span>
                  <span className="block text-xs text-gray-500">{o.customerEmail}</span>
                </Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={o.status} />
                    {o.payments[0]?.isSimulated && <SimulatedBadge />}
                  </span>
                </Td>
                <Td className="font-semibold">{formatARS(o.total)}</Td>
              </tr>
            ))}
          </Table>
          <Pagination base="/admin/pedidos" params={{ comercio, estado, desde, hasta }} page={data.page} pages={data.pages} total={data.total} />
        </>
      )}
    </div>
  );
}
