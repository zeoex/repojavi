import Link from "next/link";
import { requireAdminPage } from "./_auth";
import { platformDashboard } from "@/server/services/reports";
import { listMerchantOptions } from "@/server/services/platform";
import { ORDER_STATUS_LABEL } from "@/server/domain/orderStatus";
import { formatARS, ZERO } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/time";
import { Alert, Badge, Button, Card, EmptyState, Input, LinkButton, PageTitle, Select, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { ORDER_STATUSES, param, parseDayAR, parseOrderStatus, type SearchParams } from "./_shared";

export const metadata = { title: "Resumen" };

export default async function AdminDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireAdminPage();
  const sp = await searchParams;
  const desde = param(sp, "desde");
  const hasta = param(sp, "hasta");
  const comercio = param(sp, "comercio");
  const estado = param(sp, "estado");
  const from = parseDayAR(desde);
  const to = parseDayAR(hasta, true);
  const status = parseOrderStatus(estado);
  const invalidRange = Boolean(from && to && from > to);

  const [d, merchants] = await Promise.all([
    platformDashboard(actor, { from, to: invalidRange ? undefined : to, merchantId: comercio || undefined, status }),
    listMerchantOptions(actor),
  ]);
  const f = d.financials;
  const maxSales = d.salesByMerchant.reduce((m, s) => (s.total.greaterThan(m) ? s.total : m), ZERO);
  const hasFilters = Boolean(desde || hasta || comercio || estado);

  return (
    <div className="space-y-8">
      <PageTitle title="Resumen de la plataforma" subtitle="Métricas de todos los comercios de Fedexpress." />

      <Card className="p-4">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <div className="space-y-1">
            <label htmlFor="desde" className="block text-sm font-medium text-gray-700">Desde</label>
            <Input id="desde" name="desde" type="date" defaultValue={desde} />
          </div>
          <div className="space-y-1">
            <label htmlFor="hasta" className="block text-sm font-medium text-gray-700">Hasta</label>
            <Input id="hasta" name="hasta" type="date" defaultValue={hasta} />
          </div>
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
            <label htmlFor="estado" className="block text-sm font-medium text-gray-700">Estado del pedido</label>
            <Select id="estado" name="estado" defaultValue={estado}>
              <option value="">Todos</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">Filtrar</Button>
            {hasFilters && (
              <LinkButton href="/admin" variant="secondary">
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

      <section aria-labelledby="sec-comercios" className="space-y-3">
        <h2 id="sec-comercios" className="text-lg font-semibold text-gray-900">Comercios y clientes</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Comercios" value={d.merchants.total} hint={d.merchants.deleted ? `${d.merchants.deleted} eliminados (no incluidos)` : undefined} />
          <Stat label="Activos" value={d.merchants.active} tone="ok" />
          <Stat label="Suspendidos" value={d.merchants.suspended} tone={d.merchants.suspended ? "warn" : undefined} />
          <Stat label="Pendientes" value={d.merchants.pending} tone={d.merchants.pending ? "warn" : undefined} />
          <Stat label="Clientes" value={d.customers} />
        </div>
      </section>

      <section aria-labelledby="sec-pedidos" className="space-y-3">
        <h2 id="sec-pedidos" className="text-lg font-semibold text-gray-900">Pedidos y dinero</h2>
        <Alert tone="info">
          <strong>Las ventas brutas son cobros de los comercios, no ingresos de Fedexpress.</strong> Cada comercio cobra en su propia cuenta de Mercado Pago.
        </Alert>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Stat label="Pedidos totales" value={d.orders.total} />
          <Stat label="Pendientes de pago" value={d.orders.pendingPayment} tone={d.orders.pendingPayment ? "warn" : undefined} />
          <Stat label="Pedidos pagados" value={d.orders.paid} tone="ok" />
          <Stat label="Entregas pendientes" value={d.pendingDeliveries} hint="Sin asignar, asignadas o en camino" />
          <Stat label="Ventas brutas" value={formatARS(f.grossSales)} hint="Total de pedidos con pago confirmado" />
          <Stat label="Cobrado real (Mercado Pago)" value={formatARS(f.collectedReal)} tone="ok" />
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">Cobrado SIMULADO</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{formatARS(f.collectedSimulated)}</p>
            <p className="mt-1 text-xs text-red-700">Pagos de demostración: no es dinero real.</p>
          </div>
          <Stat label="Reembolsos" value={formatARS(f.refunds)} />
          <Stat label="Envíos" value={formatARS(f.shipping)} hint="Incluidos en las ventas brutas" />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="sec-ventas" className="space-y-3">
          <h2 id="sec-ventas" className="text-lg font-semibold text-gray-900">Ventas por comercio</h2>
          {d.salesByMerchant.length === 0 ? (
            <EmptyState icon="📊" title="Sin ventas en este período" description="Cuando haya pedidos pagados van a aparecer acá." />
          ) : (
            <Card className="p-4">
              <ul className="space-y-3">
                {d.salesByMerchant.map((s) => {
                  const pct = maxSales.isZero() ? 0 : Math.max(2, Number(s.total.div(maxSales).times(100).toFixed(0)));
                  return (
                    <li key={s.merchantId}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <Link href={`/admin/comercios/${s.merchantId}`} className="truncate font-medium text-gray-900 hover:underline">
                          {s.name}
                        </Link>
                        <span className="shrink-0 font-semibold text-gray-900">
                          {formatARS(s.total)} <span className="font-normal text-gray-500">· {s.orders} ped.</span>
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden>
                        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </section>

        <section aria-labelledby="sec-estados" className="space-y-3">
          <h2 id="sec-estados" className="text-lg font-semibold text-gray-900">Pedidos por estado</h2>
          {d.orders.total === 0 ? (
            <EmptyState icon="📦" title="Sin pedidos" description="No hay pedidos con los filtros elegidos." />
          ) : (
            <Table head={["Estado", "Pedidos"]}>
              {ORDER_STATUSES.filter((s) => d.orders.byStatus[s]).map((s) => (
                <tr key={s}>
                  <Td>
                    <StatusBadge status={s} />
                  </Td>
                  <Td>
                    <Link className="font-semibold text-brand-700 hover:underline" href={`/admin/pedidos?estado=${s}${comercio ? `&comercio=${comercio}` : ""}`}>
                      {d.orders.byStatus[s]}
                    </Link>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      </div>

      <section aria-labelledby="sec-errores" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="sec-errores" className="text-lg font-semibold text-gray-900">Últimos errores de pago</h2>
          <Link href="/admin/eventos?nivel=error" className="text-sm font-semibold text-brand-700 hover:underline">
            Ver todos
          </Link>
        </div>
        {d.paymentErrors.length === 0 ? (
          <Alert tone="success">No hay errores de pago registrados.</Alert>
        ) : (
          <Table head={["Fecha", "Origen", "Mensaje"]}>
            {d.paymentErrors.map((e) => (
              <tr key={e.id}>
                <Td>{formatDateTimeAR(e.createdAt)}</Td>
                <Td>
                  <Badge tone="red">{e.source}</Badge>
                </Td>
                <Td className="min-w-64 whitespace-normal">{e.message}</Td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section aria-labelledby="sec-actividad" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="sec-actividad" className="text-lg font-semibold text-gray-900">Actividad reciente</h2>
          <Link href="/admin/auditoria" className="text-sm font-semibold text-brand-700 hover:underline">
            Ver auditoría
          </Link>
        </div>
        {d.recent.length === 0 ? (
          <EmptyState icon="📝" title="Sin actividad registrada" />
        ) : (
          <Table head={["Fecha", "Usuario", "Acción", "Entidad"]}>
            {d.recent.map((a) => (
              <tr key={a.id}>
                <Td>{formatDateTimeAR(a.createdAt)}</Td>
                <Td>{a.actor?.email ?? <span className="text-gray-500">Sistema</span>}</Td>
                <Td>
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{a.action}</code>
                </Td>
                <Td className="text-gray-600">{a.entityType}</Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
