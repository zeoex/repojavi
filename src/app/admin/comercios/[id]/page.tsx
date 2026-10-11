import Link from "next/link";
import { notFound } from "next/navigation";
import { getMerchantAdmin } from "@/server/services/platform";
import { NotFoundError } from "@/lib/errors";
import { formatDateTimeAR } from "@/lib/time";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, Card, Field, Input, LinkButton, PageTitle } from "@/components/ui";
import {
  addMerchantAdminAction,
  removeMerchantAdminAction,
  setMerchantFeaturedAction,
  setMerchantStatusAction,
  softDeleteMerchantAction,
} from "@/app/actions/admin";
import { requireAdminPage } from "../../_auth";
import { MERCHANT_STATUS } from "../../_shared";

export const metadata = { title: "Comercio" };

const PA_STATUS = { CONNECTED: "Conectada", EXPIRED: "Vencida", REVOKED: "Revocada", ERROR: "Con error" } as const;

export default async function AdminMerchantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireAdminPage(`/admin/comercios/${id}`);
  let m;
  try {
    m = await getMerchantAdmin(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const deleted = Boolean(m.deletedAt);
  const address = [m.street && `${m.street} ${m.streetNumber ?? ""}`.trim(), m.city, m.province, m.postalCode].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <Link href="/admin/comercios" className="text-sm font-semibold text-brand-700 hover:underline">
        ← Volver a comercios
      </Link>
      <PageTitle
        title={m.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={MERCHANT_STATUS[m.status].tone}>{MERCHANT_STATUS[m.status].label}</Badge>
            {deleted && <Badge tone="gray">Eliminado el {formatDateTimeAR(m.deletedAt!)}</Badge>}
            {m.featured && <Badge tone="violet">★ Destacado</Badge>}
            {m.salesPaused && <Badge tone="amber">Ventas pausadas por el comercio</Badge>}
            <span>{m.businessType}</span>
          </span>
        }
        actions={
          <>
            <LinkButton href={`/panel/${m.id}`} variant="secondary">
              Ver panel del comercio
            </LinkButton>
            {!deleted && m.status === "ACTIVE" && (
              <LinkButton href={`/comercios/${m.slug}`} variant="ghost" target="_blank" rel="noopener">
                Ver página pública ↗
              </LinkButton>
            )}
          </>
        }
      />

      {deleted && <Alert tone="warning">Este comercio fue eliminado lógicamente: no aparece en el portal, pero se conserva su historial de pedidos y pagos.</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Datos</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-gray-500">Slug</dt>
            <dd className="break-all">/comercios/{m.slug}</dd>
            <dt className="font-medium text-gray-500">Teléfono</dt>
            <dd>{m.phone ? <a className="text-brand-700 hover:underline" href={`tel:${m.phone}`}>{m.phone}</a> : "—"}</dd>
            <dt className="font-medium text-gray-500">Email</dt>
            <dd className="break-all">{m.email ? <a className="text-brand-700 hover:underline" href={`mailto:${m.email}`}>{m.email}</a> : "—"}</dd>
            <dt className="font-medium text-gray-500">Dirección</dt>
            <dd>{address || "—"}</dd>
            <dt className="font-medium text-gray-500">Razón social / CUIT</dt>
            <dd>{[m.legalName, m.taxId].filter(Boolean).join(" · ") || "—"}</dd>
            <dt className="font-medium text-gray-500">Alta</dt>
            <dd>{formatDateTimeAR(m.createdAt)}</dd>
            <dt className="font-medium text-gray-500">Catálogo</dt>
            <dd>
              {m._count.products} productos · {m._count.zones} zonas · {m._count.couriers} repartidores · {m._count.orders} pedidos
            </dd>
            <dt className="font-medium text-gray-500">Mercado Pago</dt>
            <dd>
              {m.paymentAccount ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={m.paymentAccount.status === "CONNECTED" ? "green" : "red"}>{PA_STATUS[m.paymentAccount.status]}</Badge>
                  {!m.paymentAccount.liveMode && <Badge tone="amber">Modo prueba</Badge>}
                  <span className="text-gray-600">desde {formatDateTimeAR(m.paymentAccount.connectedAt)}</span>
                  {m.paymentAccount.lastError && <span className="w-full text-xs text-red-700">Último error: {m.paymentAccount.lastError}</span>}
                </span>
              ) : (
                <Badge tone="gray">No conectado</Badge>
              )}
            </dd>
          </dl>
          {m.description && <p className="mt-4 whitespace-pre-line text-sm text-gray-700">{m.description}</p>}
        </Card>

        <Card className="space-y-5 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900">Acciones</h2>
          {deleted ? (
            <p className="text-sm text-gray-600">No hay acciones disponibles para un comercio eliminado.</p>
          ) : (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">Estado</h3>
                <div className="flex flex-wrap gap-2">
                  {m.status !== "ACTIVE" && (
                    <ActionButton action={setMerchantStatusAction.bind(null, m.id, "ACTIVE")} variant="primary" pendingText="Activando…">
                      Activar
                    </ActionButton>
                  )}
                  {m.status !== "SUSPENDED" && (
                    <ActionButton
                      action={setMerchantStatusAction.bind(null, m.id, "SUSPENDED")}
                      variant="secondary"
                      pendingText="Suspendiendo…"
                      confirm={`¿Suspender "${m.name}"? Deja de aparecer en el portal y no puede recibir pedidos.`}
                    >
                      Suspender
                    </ActionButton>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">Destacado en la portada</h3>
                <ActionButton action={setMerchantFeaturedAction.bind(null, m.id, !m.featured)} variant="secondary" pendingText="Guardando…">
                  {m.featured ? "Quitar destacado" : "★ Destacar"}
                </ActionButton>
              </div>
              <div className="space-y-2 border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-red-700">Zona de riesgo</h3>
                <p className="text-xs text-gray-600">La eliminación es lógica: se oculta del portal y se suspende, pero el historial se conserva.</p>
                <ActionButton
                  action={softDeleteMerchantAction.bind(null, m.id)}
                  variant="danger"
                  pendingText="Eliminando…"
                  confirm={`¿Eliminar "${m.name}"? Esta acción no se puede deshacer desde el panel.`}
                >
                  Eliminar lógicamente
                </ActionButton>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Administradores</h2>
        {m.members.length === 0 ? (
          <Alert tone="warning">Este comercio no tiene administradores.</Alert>
        ) : (
          <ul className="divide-y divide-gray-100">
            {m.members.map((mu) => (
              <li key={mu.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{mu.user.name ?? mu.user.email}</p>
                  <p className="truncate text-sm text-gray-600">{mu.user.email}</p>
                  <div className="mt-1 flex gap-1">
                    <Badge tone={mu.role === "OWNER" ? "violet" : "gray"}>{mu.role === "OWNER" ? "Dueño" : "Administrador"}</Badge>
                    {mu.user.status === "SUSPENDED" && <Badge tone="red">Usuario suspendido</Badge>}
                  </div>
                </div>
                {!deleted && m.members.length > 1 && (
                  <ActionButton
                    action={removeMerchantAdminAction.bind(null, m.id, mu.user.id)}
                    variant="ghost"
                    pendingText="Quitando…"
                    confirm={`¿Quitar a ${mu.user.email} como administrador de ${m.name}?`}
                  >
                    Quitar
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {!deleted && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <ActionForm action={addMerchantAdminAction.bind(null, m.id)} resetOnSuccess className="sm:max-w-md">
              <Field label="Agregar administrador por email" htmlFor="new-admin" hint="Si todavía no tiene cuenta, se vincula cuando ingrese con Google.">
                <Input id="new-admin" name="email" type="email" required maxLength={120} placeholder="persona@ejemplo.com" />
              </Field>
              <SubmitButton pendingText="Agregando…">Agregar</SubmitButton>
            </ActionForm>
          </div>
        )}
      </Card>
    </div>
  );
}
