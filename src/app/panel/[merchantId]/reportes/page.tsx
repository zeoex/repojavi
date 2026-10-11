import { formatARS } from "@/lib/money";
import { merchantDashboard } from "@/server/services/reports";
import { Card, PageTitle, Stat } from "@/components/ui";
import { requireMerchantPage } from "../../_lib/guard";
import { parseDateRange } from "../../_lib/dates";
import { DateFilter } from "../../_components/date-filter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportes" };

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ merchantId: string }>; searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const { merchantId } = await params;
  const actor = await requireMerchantPage(merchantId, "/reportes");
  const range = parseDateRange(await searchParams);
  const d = await merchantDashboard(actor, merchantId, range.invalid ? {} : { from: range.from, to: range.to });
  const f = d.financials;
  const base = `/panel/${merchantId}/reportes`;
  const qs = new URLSearchParams();
  if (!range.invalid && range.desde) qs.set("desde", range.desde);
  if (!range.invalid && range.hasta) qs.set("hasta", range.hasta);
  const csvHref = `/api/panel/${merchantId}/export${qs.toString() ? `?${qs}` : ""}`;

  return (
    <div className="space-y-6">
      <PageTitle title="Reportes" subtitle="Elegí un período para ver tus números y descargar el detalle de pedidos." />
      <Card className="space-y-4 p-4">
        <DateFilter action={base} desde={range.desde} hasta={range.hasta} invalid={range.invalid} />
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          {/* Descarga directa (no navegación del cliente): enlace <a> común */}
          <a href={csvHref} download className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            Descargar pedidos (CSV)
          </a>
          <p className="text-xs text-gray-500">
            {range.desde || range.hasta ? "Incluye los pedidos del período elegido" : "Incluye todos tus pedidos"} (hasta 5000). Separador “;” y coma decimal, listo para Excel.
          </p>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Ventas brutas" value={formatARS(f.grossSales)} hint={`${f.paidOrders} pedidos pagados`} />
        <Stat label="Cobrado real" value={formatARS(f.collectedReal)} tone="ok" />
        <Stat label="Simulado (no es dinero real)" value={formatARS(f.collectedSimulated)} />
        <Stat label="Reembolsos" value={formatARS(f.refunds)} tone={f.refunds.isZero() ? undefined : "warn"} />
        <Stat label="Envíos" value={formatARS(f.shipping)} />
      </div>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-semibold">Cómo se calculan</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-semibold">Ventas brutas</dt>
            <dd className="text-gray-700">
              Suma del total (productos + envío) de los pedidos con pago confirmado en el período, aunque después se hayan reembolsado. Es lo que vendió tu comercio:{" "}
              <strong>no es ingreso de la plataforma</strong> ni descuenta comisiones de Mercado Pago.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Cobrado real</dt>
            <dd className="text-gray-700">Pagos reales de Mercado Pago aprobados (incluye los luego reembolsados). El dinero se acredita en tu cuenta de Mercado Pago.</dd>
          </div>
          <div>
            <dt className="font-semibold">Simulado</dt>
            <dd className="text-gray-700">Pagos de demostración (marcados como PAGO SIMULADO). No es dinero real y no se acredita en ninguna cuenta.</dd>
          </div>
          <div>
            <dt className="font-semibold">Reembolsos</dt>
            <dd className="text-gray-700">Reembolsos aprobados de pedidos del período. Para conocer tu neto, restalos de lo cobrado.</dd>
          </div>
          <div>
            <dt className="font-semibold">Envíos</dt>
            <dd className="text-gray-700">Costo de envío cobrado a los clientes, ya incluido en las ventas brutas.</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-gray-500">Las fechas se toman en hora de Argentina según la creación del pedido.</p>
      </Card>
    </div>
  );
}
