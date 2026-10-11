import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/authz";
import { listAddresses } from "@/server/services/addresses";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction } from "@/app/actions/customer";
import { ActionButton } from "@/components/forms";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { AddressForm } from "@/components/public/address-form";
import { formatAddressLine } from "@/components/public/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis direcciones" };

const SELF = "/cuenta/direcciones";

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const actor = await getActor();
  if (!actor) redirect(`/ingresar?callbackUrl=${SELF}`);
  const sp = await searchParams;
  const addresses = await listAddresses(actor.userId);
  const editing = typeof sp.editar === "string" ? addresses.find((a) => a.id === sp.editar) : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageTitle title="Mis direcciones" subtitle="Usamos tu código postal para saber qué comercios te pueden enviar el pedido." />

      <section aria-labelledby="lista-direcciones" className="space-y-3">
        <h2 id="lista-direcciones" className="sr-only">
          Direcciones guardadas
        </h2>
        {addresses.length === 0 ? (
          <EmptyState icon="📍" title="No tenés direcciones guardadas" description="Agregá tu primera dirección con el formulario de abajo." />
        ) : (
          <ul className="space-y-3">
            {addresses.map((a) => (
              <li key={a.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                        {a.label || `${a.street} ${a.streetNumber}`}
                        {a.isDefault && <Badge tone="violet">Predeterminada</Badge>}
                      </p>
                      <p className="text-sm text-gray-600">{formatAddressLine(a)}</p>
                      {(a.contactName || a.contactPhone) && <p className="text-sm text-gray-600">Contacto: {[a.contactName, a.contactPhone].filter(Boolean).join(" · ")}</p>}
                      {a.instructions && <p className="text-sm text-gray-500">Indicaciones: {a.instructions}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`${SELF}?editar=${a.id}#editar`}
                      className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                    >
                      Editar
                    </Link>
                    {!a.isDefault && (
                      <ActionButton action={setDefaultAddressAction.bind(null, a.id)} pendingText="Guardando…">
                        Usar como predeterminada
                      </ActionButton>
                    )}
                    <ActionButton action={deleteAddressAction.bind(null, a.id)} variant="ghost" className="text-red-700" pendingText="Eliminando…" confirm="¿Eliminar esta dirección?">
                      Eliminar
                    </ActionButton>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing ? (
        <section id="editar" aria-labelledby="titulo-editar">
          <Card className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 id="titulo-editar" className="text-lg font-semibold">
                Editar dirección
              </h2>
              <Link href={SELF} className="text-sm text-gray-600 hover:underline">
                Cancelar
              </Link>
            </div>
            <AddressForm key={editing.id} action={saveAddressAction.bind(null, editing.id)} initial={{
                label: editing.label,
                street: editing.street,
                streetNumber: editing.streetNumber,
                apartment: editing.apartment,
                city: editing.city,
                province: editing.province,
                postalCode: editing.postalCode,
                instructions: editing.instructions,
                contactName: editing.contactName,
                contactPhone: editing.contactPhone,
                isDefault: editing.isDefault,
              }}
              submitLabel="Guardar cambios" redirectTo={SELF} />
          </Card>
        </section>
      ) : (
        <section aria-labelledby="titulo-nueva">
          <Card className="space-y-4 p-4 sm:p-6">
            <h2 id="titulo-nueva" className="text-lg font-semibold">
              Agregá una dirección
            </h2>
            <AddressForm action={saveAddressAction.bind(null, null)} initial={{ contactName: actor.name ?? "", isDefault: addresses.length === 0 }} resetOnSuccess />
          </Card>
        </section>
      )}
    </div>
  );
}
