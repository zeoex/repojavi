import Link from "next/link";
import { listMerchantOptions, listSystemEvents } from "@/server/services/platform";
import { formatDateTimeAR } from "@/lib/time";
import { Badge, Button, Card, EmptyState, LinkButton, PageTitle, Select, Table, Td } from "@/components/ui";
import { requireAdminPage } from "../_auth";
import { Pagination, pageParam, param, type SearchParams } from "../_shared";

export const metadata = { title: "Eventos del sistema" };

const LEVELS = [
  { value: "error", label: "Error", tone: "red" as const },
  { value: "warn", label: "Advertencia", tone: "amber" as const },
  { value: "info", label: "Información", tone: "blue" as const },
];

export default async function AdminSystemEventsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireAdminPage("/admin/eventos");
  const sp = await searchParams;
  const nivel = param(sp, "nivel");
  const origen = param(sp, "origen");
  const [data, merchants] = await Promise.all([listSystemEvents(actor, { level: nivel, source: origen, page: pageParam(sp) }), listMerchantOptions(actor)]);
  const nameOf = new Map(merchants.map((m) => [m.id, m.name]));
  const hasFilters = Boolean(nivel || origen);

  return (
    <div className="space-y-6">
      <PageTitle title="Eventos del sistema" subtitle="Errores y avisos técnicos (pagos, tareas programadas, autenticación)." />

      <Card className="p-4">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
          <div className="space-y-1">
            <label htmlFor="nivel" className="block text-sm font-medium text-gray-700">Nivel</label>
            <Select id="nivel" name="nivel" defaultValue={nivel}>
              <option value="">Todos</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="origen" className="block text-sm font-medium text-gray-700">Origen</label>
            <Select id="origen" name="origen" defaultValue={origen}>
              <option value="">Todos</option>
              {data.sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">Filtrar</Button>
            {hasFilters && (
              <LinkButton href="/admin/eventos" variant="secondary">
                Limpiar
              </LinkButton>
            )}
          </div>
        </form>
      </Card>

      {data.rows.length === 0 ? (
        <EmptyState icon="✅" title="Sin eventos" description={hasFilters ? "No hay eventos con esos filtros." : "No se registraron eventos del sistema."} />
      ) : (
        <>
          <Table head={["Fecha", "Nivel", "Origen", "Mensaje", "Comercio"]}>
            {data.rows.map((e) => {
              const lvl = LEVELS.find((l) => l.value === e.level);
              return (
                <tr key={e.id}>
                  <Td>{formatDateTimeAR(e.createdAt)}</Td>
                  <Td>
                    <Badge tone={lvl?.tone ?? "gray"}>{lvl?.label ?? e.level}</Badge>
                  </Td>
                  <Td>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{e.source}</code>
                  </Td>
                  <Td className="min-w-64 whitespace-normal">{e.message}</Td>
                  <Td>
                    {e.merchantId ? (
                      <Link href={`/admin/comercios/${e.merchantId}`} className="hover:underline">
                        {nameOf.get(e.merchantId) ?? e.merchantId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
          <Pagination base="/admin/eventos" params={{ nivel, origen }} page={data.page} pages={data.pages} total={data.total} />
        </>
      )}
    </div>
  );
}
