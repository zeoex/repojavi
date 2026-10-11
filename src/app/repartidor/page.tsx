import Link from "next/link";
import { redirect } from "next/navigation";
import type { DeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor } from "@/server/authz";
import { listDeliveriesForCourier } from "@/server/services/couriers";
import { formatARS } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/time";
import { Badge, Card, EmptyState, PageTitle, cx } from "@/components/ui";
import { DeliveryActions } from "./delivery-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis entregas" };

const STATUS: Record<DeliveryStatus, { label: string; tone: "gray" | "amber" | "green" | "blue" | "red" | "violet" }> = {
  PENDING_ASSIGNMENT: { label: "Sin asignar", tone: "gray" },
  ASSIGNED: { label: "Asignada", tone: "amber" },
  ACCEPTED: { label: "Aceptada", tone: "blue" },
  PICKED_UP: { label: "En camino", tone: "violet" },
  DELIVERED: { label: "Entregada", tone: "green" },
  FAILED: { label: "No se pudo entregar", tone: "red" },
  CANCELLED: { label: "Cancelada", tone: "gray" },
};

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default async function CourierPage({ searchParams }: { searchParams: Promise<{ historial?: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/ingresar?callbackUrl=/repartidor");
  const sp = await searchParams;
  const history = sp.historial === "1";

  const profile = await prisma.courier.findFirst({ where: { userId: actor.userId, active: true }, select: { id: true } });
  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageTitle title="Mis entregas" />
        <EmptyState
          icon="🛵"
          title="Tu usuario no está registrado como repartidor de ningún comercio"
          description={`Pedile al comercio que te dé de alta como repartidor con tu email (${actor.email}). Después volvé a ingresar a esta página.`}
        />
      </div>
    );
  }

  const deliveries = await listDeliveriesForCourier(actor, { history });

  const tab = (active: boolean) =>
    cx("flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition sm:flex-none", active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle title="Mis entregas" subtitle="Seguimiento GPS en tiempo real: próximamente." />

      <nav aria-label="Entregas" className="flex gap-1 rounded-xl bg-gray-100 p-1 sm:inline-flex">
        <Link href="/repartidor" className={tab(!history)} aria-current={!history ? "page" : undefined}>
          Activas
        </Link>
        <Link href="/repartidor?historial=1" className={tab(history)} aria-current={history ? "page" : undefined}>
          Historial
        </Link>
      </nav>

      {deliveries.length === 0 ? (
        <EmptyState
          icon={history ? "📋" : "🛵"}
          title={history ? "Todavía no tenés entregas finalizadas" : "No tenés entregas activas"}
          description={history ? undefined : "Cuando un comercio te asigne un pedido, va a aparecer acá. Actualizá la página para ver novedades."}
          action={
            history ? undefined : (
              <Link href="/repartidor" className="text-sm font-semibold text-brand-700 hover:underline">
                Actualizar
              </Link>
            )
          }
        />
      ) : (
        <ul className="space-y-4">
          {deliveries.map((d) => {
            const o = d.order;
            const m = o.merchant;
            const origin = [m.street && `${m.street} ${m.streetNumber ?? ""}`.trim(), m.city].filter(Boolean).join(", ");
            const destination = `${o.shipStreet} ${o.shipStreetNumber}, ${o.shipCity}, ${o.shipProvince}`;
            const itemsCount = o.items.reduce((a, i) => a + i.quantity, 0);
            const st = STATUS[d.status];
            return (
              <li key={d.id}>
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
                    <h2 className="font-bold text-gray-900">Pedido #{o.number}</h2>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <div className="grid gap-4 p-4 sm:grid-cols-2">
                    <section aria-label="Retiro">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Retirás en</p>
                      <p className="font-semibold text-gray-900">{m.name}</p>
                      {origin ? (
                        <p className="text-sm text-gray-700">
                          {origin}{" "}
                          <a href={mapsUrl(origin)} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap font-semibold text-brand-700 hover:underline">
                            Ver en mapa ↗
                          </a>
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">Dirección no cargada</p>
                      )}
                      {m.phone && (
                        <a href={`tel:${m.phone}`} className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline">
                          📞 {m.phone}
                        </a>
                      )}
                    </section>
                    <section aria-label="Entrega">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Entregás a</p>
                      <p className="font-semibold text-gray-900">{o.contactName}</p>
                      <p className="text-sm text-gray-700">
                        {o.shipStreet} {o.shipStreetNumber}
                        {o.shipApartment ? ` · ${o.shipApartment}` : ""}, {o.shipCity} ({o.shipPostalCode}){" "}
                        <a href={mapsUrl(destination)} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap font-semibold text-brand-700 hover:underline">
                          Ver en mapa ↗
                        </a>
                      </p>
                      {o.shipInstructions && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-900">Indicaciones: {o.shipInstructions}</p>}
                      <a href={`tel:${o.contactPhone}`} className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline">
                        📞 {o.contactPhone}
                      </a>
                    </section>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 border-t border-gray-100 px-4 py-3 text-sm">
                    <div>
                      <dt className="text-xs text-gray-500">Productos</dt>
                      <dd className="font-semibold">{itemsCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Total</dt>
                      <dd className="font-semibold">{formatARS(o.total)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Demora estimada</dt>
                      <dd className="font-semibold">{o.etaMinMinutes != null && o.etaMaxMinutes != null ? `${o.etaMinMinutes}–${o.etaMaxMinutes} min` : "—"}</dd>
                    </div>
                  </dl>
                  {d.notes && <p className="border-t border-gray-100 px-4 py-2 text-sm text-gray-700">Notas: {d.notes}</p>}
                  <div className="border-t border-gray-100 px-4 py-3">
                    {history ? (
                      <p className="text-xs text-gray-500">
                        {d.deliveredAt ? `Entregado el ${formatDateTimeAR(d.deliveredAt)}` : `Actualizado el ${formatDateTimeAR(d.updatedAt)}`}
                      </p>
                    ) : (
                      <>
                        <p className="mb-2 text-xs text-gray-500">
                          {d.assignedAt && `Asignado el ${formatDateTimeAR(d.assignedAt)}`}
                          {d.pickedUpAt && ` · Retirado el ${formatDateTimeAR(d.pickedUpAt)}`}
                        </p>
                        <DeliveryActions deliveryId={d.id} orderNumber={o.number} status={d.status} />
                      </>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
