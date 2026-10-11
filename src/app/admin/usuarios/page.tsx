import Link from "next/link";
import { listUsers } from "@/server/services/platform";
import { formatDateTimeAR } from "@/lib/time";
import { ActionButton } from "@/components/forms";
import { Alert, Badge, Button, Card, EmptyState, Input, LinkButton, PageTitle, Table, Td } from "@/components/ui";
import { setUserStatusAction } from "@/app/actions/admin";
import { requireAdminPage } from "../_auth";
import { Pagination, pageParam, param, type SearchParams } from "../_shared";

export const metadata = { title: "Usuarios" };

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireAdminPage("/admin/usuarios");
  const sp = await searchParams;
  const q = param(sp, "q");
  const data = await listUsers(actor, { q, page: pageParam(sp) });

  return (
    <div className="space-y-6">
      <PageTitle title="Usuarios" subtitle="Clientes, administradores de comercios y repartidores." />

      <Alert tone="info">
        El rol <strong>SUPERADMIN</strong> no se puede otorgar desde la web (por diseño). Solo se asigna desde el servidor con el script{" "}
        <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">npm run superadmin:promote -- email</code>.
      </Alert>

      <Card className="p-4">
        <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label htmlFor="q" className="block text-sm font-medium text-gray-700">
              Buscar por email o nombre
            </label>
            <Input id="q" name="q" type="search" defaultValue={q} maxLength={100} placeholder="ej: juana@gmail.com" />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Buscar</Button>
            {q && (
              <LinkButton href="/admin/usuarios" variant="secondary">
                Limpiar
              </LinkButton>
            )}
          </div>
        </form>
      </Card>

      {data.rows.length === 0 ? (
        <EmptyState icon="👤" title={q ? "No encontramos usuarios" : "Todavía no hay usuarios"} description={q ? `No hay usuarios que coincidan con "${q}".` : undefined} />
      ) : (
        <>
          <Table head={["Email", "Nombre", "Rol", "Estado", "Comercios que administra", "Alta", "Acciones"]}>
            {data.rows.map((u) => {
              const self = u.id === actor.userId;
              const merchants = u.memberships.filter((mm) => !mm.merchant.deletedAt);
              return (
                <tr key={u.id}>
                  <Td className="font-medium text-gray-900">
                    {u.email}
                    {self && (
                      <Badge tone="blue" className="ml-2">
                        Vos
                      </Badge>
                    )}
                  </Td>
                  <Td>{u.name ?? "—"}</Td>
                  <Td>{u.platformRole === "SUPERADMIN" ? <Badge tone="violet">Superadmin</Badge> : <Badge>Cliente</Badge>}</Td>
                  <Td>{u.status === "ACTIVE" ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Suspendido</Badge>}</Td>
                  <Td className="whitespace-normal">
                    {merchants.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <ul className="flex min-w-40 flex-wrap gap-1">
                        {merchants.map((mm) => (
                          <li key={mm.merchant.id}>
                            <Link href={`/admin/comercios/${mm.merchant.id}`} className="text-brand-700 hover:underline">
                              {mm.merchant.name}
                            </Link>
                            {mm.role === "OWNER" && <span className="text-xs text-gray-500"> (dueño)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td>{formatDateTimeAR(u.createdAt)}</Td>
                  <Td>
                    {self ? (
                      <span className="text-xs text-gray-500">No podés cambiar tu propio estado</span>
                    ) : u.status === "ACTIVE" ? (
                      <ActionButton
                        action={setUserStatusAction.bind(null, u.id, "SUSPENDED")}
                        variant="danger"
                        pendingText="Suspendiendo…"
                        confirm={`¿Suspender a ${u.email}? No va a poder iniciar sesión ni operar.`}
                      >
                        Suspender
                      </ActionButton>
                    ) : (
                      <ActionButton action={setUserStatusAction.bind(null, u.id, "ACTIVE")} variant="secondary" pendingText="Reactivando…">
                        Reactivar
                      </ActionButton>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
          <Pagination base="/admin/usuarios" params={{ q }} page={data.page} pages={data.pages} total={data.total} />
        </>
      )}
    </div>
  );
}
