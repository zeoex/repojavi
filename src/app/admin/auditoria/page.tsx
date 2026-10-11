import Link from "next/link";
import { listAuditLogs, listMerchantOptions } from "@/server/services/platform";
import { formatDateTimeAR } from "@/lib/time";
import { Button, Card, EmptyState, Input, LinkButton, PageTitle, Select, Table, Td } from "@/components/ui";
import { requireAdminPage } from "../_auth";
import { Pagination, pageParam, param, type SearchParams } from "../_shared";

export const metadata = { title: "Auditoría" };

function metadataSummary(m: unknown): string {
  if (!m || typeof m !== "object") return "";
  return Object.entries(m as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 200);
}

export default async function AdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireAdminPage("/admin/auditoria");
  const sp = await searchParams;
  const accion = param(sp, "accion");
  const comercio = param(sp, "comercio");
  const [data, merchants] = await Promise.all([
    listAuditLogs(actor, { action: accion, merchantId: comercio || undefined, page: pageParam(sp) }),
    listMerchantOptions(actor),
  ]);
  const nameOf = new Map(merchants.map((m) => [m.id, m.name]));
  const hasFilters = Boolean(accion || comercio);

  return (
    <div className="space-y-6">
      <PageTitle title="Auditoría" subtitle="Registro de acciones sensibles realizadas en la plataforma." />

      <Card className="p-4">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
          <div className="space-y-1">
            <label htmlFor="accion" className="block text-sm font-medium text-gray-700">Acción contiene</label>
            <Input id="accion" name="accion" defaultValue={accion} maxLength={100} placeholder="ej: merchant.status" />
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
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">Filtrar</Button>
            {hasFilters && (
              <LinkButton href="/admin/auditoria" variant="secondary">
                Limpiar
              </LinkButton>
            )}
          </div>
        </form>
      </Card>

      {data.rows.length === 0 ? (
        <EmptyState icon="📝" title="Sin registros" description={hasFilters ? "No hay registros con esos filtros." : undefined} />
      ) : (
        <>
          <Table head={["Fecha", "Usuario", "Acción", "Entidad", "Comercio", "Detalle"]}>
            {data.rows.map((a) => (
              <tr key={a.id}>
                <Td>{formatDateTimeAR(a.createdAt)}</Td>
                <Td>{a.actor?.email ?? <span className="text-gray-500">Sistema</span>}</Td>
                <Td>
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{a.action}</code>
                </Td>
                <Td className="text-xs">
                  {a.entityType}
                  {a.entityId && <span className="block font-mono text-gray-500">{a.entityId}</span>}
                </Td>
                <Td>
                  {a.merchantId ? (
                    <Link href={`/admin/comercios/${a.merchantId}`} className="hover:underline">
                      {nameOf.get(a.merchantId) ?? a.merchantId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="min-w-48 whitespace-normal text-xs text-gray-600">{metadataSummary(a.metadata) || "—"}</Td>
              </tr>
            ))}
          </Table>
          <Pagination base="/admin/auditoria" params={{ accion, comercio }} page={data.page} pages={data.pages} total={data.total} />
        </>
      )}
    </div>
  );
}
