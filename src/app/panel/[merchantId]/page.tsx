import Link from "next/link";
import { formatARS } from "@/lib/money";
import { merchantDashboard } from "@/server/services/reports";
import { Badge, Card, PageTitle, Stat, Table, Td } from "@/components/ui";
import { requireMerchantPage } from "../_lib/guard";
import { parseDateRange } from "../_lib/dates";
import { DateFilter } from "../_components/date-filter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resumen del comercio" };

type SP = Promise<{ desde?: string; hasta?: string }>;

export default async function MerchantDashboardPage({ params, searchParams }: { params: Promise<{ merchantId: string }>; searchParams: SP }) {
  const { merchantId } = await params;
  const actor = await requireMerchantPage(merchantId);
  const range = parseDateRange(await searchParams);
  const d = await merchantDashboard(actor, merchantId, range.invalid ? {} : { from: range.from, to: range.to });
  const f = d.financials;
  const base = `/panel/${merchantId}`;
  const periodo = range.desde || range.hasta ? "en el período elegido" : "desde el inicio";

  return (
    <div className="space-y-8">
      <PageTitle title="Resumen" subtitle={`Ventas y operación ${periodo}.`} />
      <Card className="p-4">
        <DateFilter action={base} desde={range.desde} hasta={range.hasta} invalid={range.invalid} />
      </Card>

      <section aria-labelledby="ventas" className="space-y-3">
        <h2 id="ventas" className="text-lg font-semibold">Ventas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Ventas brutas" value={formatARS(f.grossSales)} hint={`${f.paidOrders} pedidos con pago confirmado (incluye envíos)`} />
          <Stat label="Cobrado real (Mercado Pago)" value={formatARS(f.collectedReal)} tone="ok" hint="Pagos reales aprobados" />
          <Stat label="Simulado (no es dinero real)" value={formatARS(f.collectedSimulated)} hint="Pagos de demostración" />
          <Stat label="Reembolsos" value={formatARS(f.refunds)} tone={f.refunds.isZero() ? undefined : "warn"} hint="Reembolsos aprobados" />
          <Stat label="Envíos" value={formatARS(f.shipping)} hint="Costo de envío cobrado en las ventas" />
        </div>
      </section>

      <section aria-labelledby="operacion" className="space-y-3">
        <h2 id="operacion" className="text-lg font-semibold">Pedidos</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Link href={`${base}/pedidos?estado=PENDING_PAYMENT`} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-300">
            <Stat label="Pendientes de pago" value={d.pendingPayment} />
          </Link>
          <Link href={`${base}/pedidos?estado=PAID`} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-300">
            <Stat label="A preparar" value={d.toPrepare} tone={d.toPrepare > 0 ? "warn" : undefined} hint="Pagos aprobados" />
          </Link>
          <Link href={`${base}/pedidos?estado=PREPARING`} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-300">
            <Stat label="En preparación" value={d.preparing} />
          </Link>
          <Link href={`${base}/pedidos?estado=COURIER_ASSIGNED,ON_THE_WAY`} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-300">
            <Stat label="Entregas en curso" value={d.inDelivery} hint="Asignadas a repartidores" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="top" className="space-y-3">
        <h2 id="top" className="text-lg font-semibold">Productos más vendidos</h2>
        <Table
          head={["Producto", "Unidades", "Total"]}
          empty={d.topProducts.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">Todavía no hay ventas en este período.</p> : undefined}
        >
          {d.topProducts.map((p) => (
            <tr key={p.name}>
              <Td className="whitespace-normal font-medium">{p.name}</Td>
              <Td>{p.quantity}</Td>
              <Td>{formatARS(p.total)}</Td>
            </tr>
          ))}
        </Table>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <StockTable title="Stock bajo" tone="amber" rows={d.lowStock} base={base} emptyText="Ningún producto por debajo del stock mínimo." />
        <StockTable title="Agotados" tone="red" rows={d.outOfStock} base={base} emptyText="No tenés productos agotados." />
      </div>
    </div>
  );
}

type VariantRow = Awaited<ReturnType<typeof merchantDashboard>>["outOfStock"][number];

function StockTable({ title, rows, base, emptyText, tone }: { title: string; rows: VariantRow[]; base: string; emptyText: string; tone: "amber" | "red" }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {title} <Badge tone={tone}>{rows.length}</Badge>
      </h2>
      <Table head={["Producto", "Variante", "Disponible", ""]} empty={rows.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">{emptyText}</p> : undefined}>
        {rows.slice(0, 20).map((v) => (
          <tr key={v.id}>
            <Td className="whitespace-normal font-medium">
              {v.product.name}
              {!v.product.active && <span className="ml-2 text-xs text-gray-500">(pausado)</span>}
            </Td>
            <Td>{v.name}</Td>
            <Td>
              {v.inventory ? Math.max(0, v.inventory.quantity - v.inventory.reserved) : 0}
              {v.inventory?.minStock != null && <span className="text-xs text-gray-500"> / mín. {v.inventory.minStock}</span>}
            </Td>
            <Td>
              <Link href={`${base}/productos/${v.product.id}`} className="font-medium text-brand-700 hover:underline">
                Editar
              </Link>
            </Td>
          </tr>
        ))}
      </Table>
      {rows.length > 20 && (
        <Link href={`${base}/inventario`} className="text-sm font-medium text-brand-700 hover:underline">
          Ver los {rows.length} en Inventario
        </Link>
      )}
    </section>
  );
}
