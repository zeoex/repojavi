import { listCouriers } from "@/server/services/couriers";
import { saveCourierAction, setCourierActiveAction } from "@/app/actions/merchant";
import { ActionButton } from "@/components/forms";
import { FieldsForm, type FieldSpec } from "../../_components/fields-form";
import { Alert, Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { requireMerchantPage } from "../../_lib/guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Repartidores" };

type CourierValues = { name: string; email: string; phone: string | null; vehicle: string | null };

function courierFields(values?: CourierValues): FieldSpec[] {
  return [
    { name: "name", label: "Nombre", defaultValue: values?.name, maxLength: 80, required: true, autoComplete: "off" },
    { name: "email", label: "Email de Google", type: "email", defaultValue: values?.email, required: true, autoComplete: "off", hint: "Con esta cuenta va a ingresar a Fedexpress." },
    { name: "phone", label: "Teléfono (opcional)", type: "tel", defaultValue: values?.phone ?? "", maxLength: 30 },
    { name: "vehicle", label: "Vehículo (opcional)", defaultValue: values?.vehicle ?? "", maxLength: 40, placeholder: "Moto, bici, auto…" },
  ];
}

export default async function CouriersPage({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const actor = await requireMerchantPage(merchantId, "/repartidores");
  const couriers = await listCouriers(actor, merchantId);

  return (
    <div className="space-y-6">
      <PageTitle title="Repartidores" subtitle="Las personas que entregan los pedidos de tu comercio." />
      <Alert tone="info">
        El repartidor ingresa con la cuenta de Google de ese email y ve sus entregas en <strong>/repartidor</strong>. Si todavía no ingresó nunca, figura como “sin cuenta
        vinculada” hasta su primer ingreso.
      </Alert>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-semibold">Nuevo repartidor</h2>
        <FieldsForm action={saveCourierAction.bind(null, merchantId, null)} idPrefix="new" resetOnSuccess fields={courierFields()} submitLabel="Agregar repartidor" />
      </Card>

      {couriers.length === 0 ? (
        <EmptyState icon="🛵" title="Todavía no tenés repartidores" description="Dalos de alta con su email para poder asignarles pedidos." />
      ) : (
        <ul className="space-y-3">
          {couriers.map((c) => (
            <li key={c.id}>
              <Card className="space-y-3 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {c.name}
                      {c.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}
                      {c.userId ? <Badge tone="blue">Cuenta vinculada</Badge> : <Badge tone="amber">Sin cuenta vinculada</Badge>}
                    </p>
                    <p className="break-all text-sm text-gray-700">{c.email}</p>
                    <p className="text-sm text-gray-600">
                      {c.phone ?? "Sin teléfono"} · {c.vehicle ?? "Vehículo no indicado"}
                    </p>
                    <p className="text-sm text-gray-600">
                      Entregas en curso: <strong>{c._count.deliveries}</strong>
                    </p>
                  </div>
                  <ActionButton
                    action={setCourierActiveAction.bind(null, merchantId, c.id, !c.active)}
                    variant={c.active ? "secondary" : "primary"}
                    confirm={c.active && c._count.deliveries > 0 ? `${c.name} tiene ${c._count.deliveries} entregas en curso. Si lo desactivás no va a poder actualizarlas. ¿Continuar?` : undefined}
                  >
                    {c.active ? "Desactivar" : "Activar"}
                  </ActionButton>
                </div>
                <details className="rounded-xl border border-gray-200 p-3">
                  <summary className="cursor-pointer select-none text-sm font-semibold text-brand-700">Editar datos</summary>
                  <div className="mt-3">
                    <FieldsForm action={saveCourierAction.bind(null, merchantId, c.id)} idPrefix={`c-${c.id}`} fields={courierFields(c)} submitLabel="Guardar cambios" />
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
