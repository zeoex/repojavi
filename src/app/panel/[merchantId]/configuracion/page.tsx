import { prisma } from "@/lib/db";
import { formatARS } from "@/lib/money";
import { deleteZoneAction, replaceHoursAction, saveZoneAction, updateProfileAction, updateSettingsAction } from "@/app/actions/merchant";
import { ActionButton } from "@/components/forms";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireMerchantPage } from "../../_lib/guard";
import { FieldsForm, type FieldSpec } from "../../_components/fields-form";
import { HoursForm } from "./hours-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración" };

type ZoneValues = {
  name: string;
  postalCodes: string[];
  fee: { toFixed(n: number): string };
  freeShippingOver: { toFixed(n: number): string } | null;
  minOrderAmount: { toFixed(n: number): string };
  etaMinMinutes: number;
  etaMaxMinutes: number;
  active: boolean;
};

function zoneFields(z?: ZoneValues): FieldSpec[] {
  return [
    { name: "name", label: "Nombre de la zona", defaultValue: z?.name, required: true, maxLength: 60, placeholder: "Ej: Palermo" },
    {
      name: "postalCodes",
      label: "Códigos postales",
      defaultValue: z?.postalCodes.join(", "),
      required: true,
      placeholder: "1414, C1414, 1425",
      hint: "Separados por coma. Incluí las variantes que usan tus clientes (ej: 1414 y C1414).",
    },
    { name: "fee", label: "Costo de envío", defaultValue: z?.fee.toFixed(2) ?? "", required: true, inputMode: "decimal", placeholder: "1500" },
    { name: "freeShippingOver", label: "Envío gratis desde (opcional)", defaultValue: z?.freeShippingOver?.toFixed(2) ?? "", inputMode: "decimal", placeholder: "Sin envío gratis" },
    { name: "minOrderAmount", label: "Compra mínima en la zona", defaultValue: z?.minOrderAmount.toFixed(2) ?? "0", inputMode: "decimal" },
    { name: "etaMinMinutes", label: "Demora mínima (minutos)", type: "number", defaultValue: String(z?.etaMinMinutes ?? 30), min: 5, max: 600, required: true },
    { name: "etaMaxMinutes", label: "Demora máxima (minutos)", type: "number", defaultValue: String(z?.etaMaxMinutes ?? 60), min: 5, max: 600, required: true },
    { name: "active", label: "Zona activa", type: "checkbox", defaultChecked: z?.active ?? true },
  ];
}

export default async function SettingsPage({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  await requireMerchantPage(merchantId, "/configuracion");
  const merchant = await prisma.merchant.findFirst({
    where: { id: merchantId, deletedAt: null },
    include: {
      settings: true,
      hours: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }] },
      zones: { orderBy: { name: "asc" } },
    },
  });
  if (!merchant) return null; // el layout ya respondió 404
  const s = merchant.settings;

  const profileFields: FieldSpec[] = [
    { name: "name", label: "Nombre del comercio", defaultValue: merchant.name, required: true, maxLength: 80 },
    { name: "businessType", label: "Rubro", defaultValue: merchant.businessType, required: true, maxLength: 40, placeholder: "Almacén, Farmacia, Verdulería…" },
    { name: "description", label: "Descripción", type: "textarea", defaultValue: merchant.description ?? "", maxLength: 1000, full: true },
    { name: "phone", label: "Teléfono", type: "tel", defaultValue: merchant.phone ?? "", maxLength: 30 },
    { name: "email", label: "Email de contacto", type: "email", defaultValue: merchant.email ?? "" },
    { name: "logoUrl", label: "URL del logo", type: "url", defaultValue: merchant.logoUrl ?? "", placeholder: "https://…", hint: "Pegá la URL https de la imagen." },
    { name: "coverUrl", label: "URL de la portada", type: "url", defaultValue: merchant.coverUrl ?? "", placeholder: "https://…", hint: "Pegá la URL https de la imagen." },
    { name: "street", label: "Calle", defaultValue: merchant.street ?? "", maxLength: 120, autoComplete: "address-line1" },
    { name: "streetNumber", label: "Altura", defaultValue: merchant.streetNumber ?? "", maxLength: 20 },
    { name: "city", label: "Localidad", defaultValue: merchant.city ?? "", maxLength: 80, autoComplete: "address-level2" },
    { name: "province", label: "Provincia", defaultValue: merchant.province ?? "", maxLength: 80, autoComplete: "address-level1" },
    { name: "postalCode", label: "Código postal", defaultValue: merchant.postalCode ?? "", maxLength: 12, autoComplete: "postal-code" },
    { name: "legalName", label: "Datos fiscales (opcional): razón social", defaultValue: merchant.legalName ?? "", maxLength: 120 },
    { name: "taxId", label: "Datos fiscales (opcional): CUIT", defaultValue: merchant.taxId ?? "", maxLength: 20, inputMode: "numeric" },
  ];

  return (
    <div className="space-y-8">
      <PageTitle title="Configuración" subtitle="Perfil, horarios, zonas de entrega y reglas de venta." />
      <nav aria-label="Secciones de configuración" className="flex flex-wrap gap-2 text-sm">
        {[
          ["#perfil", "Perfil"],
          ["#horarios", "Horarios"],
          ["#zonas", "Zonas de entrega"],
          ["#ajustes", "Ajustes"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">
            {label}
          </a>
        ))}
      </nav>

      <section id="perfil" aria-labelledby="perfil-h" className="scroll-mt-20">
        <Card className="space-y-4 p-4 sm:p-6">
          <div>
            <h2 id="perfil-h" className="text-lg font-semibold">Perfil</h2>
            <p className="text-sm text-gray-600">Así te ven los clientes en Fedexpress. La dirección es el punto de retiro de los pedidos.</p>
          </div>
          <FieldsForm action={updateProfileAction.bind(null, merchantId)} idPrefix="perfil" fields={profileFields} submitLabel="Guardar perfil" />
        </Card>
      </section>

      <section id="horarios" aria-labelledby="horarios-h" className="scroll-mt-20">
        <Card className="space-y-4 p-4 sm:p-6">
          <h2 id="horarios-h" className="text-lg font-semibold">Horarios</h2>
          <HoursForm action={replaceHoursAction.bind(null, merchantId)} initial={merchant.hours.map((h) => ({ dayOfWeek: h.dayOfWeek, opensAt: h.opensAt, closesAt: h.closesAt }))} />
        </Card>
      </section>

      <section id="zonas" aria-labelledby="zonas-h" className="scroll-mt-20 space-y-4">
        <div>
          <h2 id="zonas-h" className="text-lg font-semibold">Zonas de entrega</h2>
          <p className="text-sm text-gray-600">Solo podés recibir pedidos de direcciones cuyo código postal esté en una zona activa.</p>
        </div>
        {merchant.zones.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Todavía no tenés zonas de entrega: nadie va a poder comprarte hasta que cargues al menos una.
          </p>
        ) : (
          <ul className="space-y-3">
            {merchant.zones.map((z) => (
              <li key={z.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1 text-sm">
                      <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                        {z.name} {z.active ? <Badge tone="green">Activa</Badge> : <Badge>Inactiva</Badge>}
                      </p>
                      <p className="text-gray-700">CP: {z.postalCodes.join(", ")}</p>
                      <p className="text-gray-700">
                        Envío {formatARS(z.fee)}
                        {z.freeShippingOver ? ` · gratis desde ${formatARS(z.freeShippingOver)}` : ""}
                        {!z.minOrderAmount.isZero() ? ` · mínimo ${formatARS(z.minOrderAmount)}` : ""} · {z.etaMinMinutes}–{z.etaMaxMinutes} min
                      </p>
                    </div>
                    <ActionButton
                      action={deleteZoneAction.bind(null, merchantId, z.id)}
                      variant="ghost"
                      className="text-red-700"
                      confirm={`¿Eliminar la zona “${z.name}”? Los clientes de esos códigos postales no van a poder comprarte.`}
                    >
                      Eliminar
                    </ActionButton>
                  </div>
                  <details className="rounded-xl border border-gray-200 p-3">
                    <summary className="cursor-pointer select-none text-sm font-semibold text-brand-700">Editar zona</summary>
                    <div className="mt-3">
                      <FieldsForm action={saveZoneAction.bind(null, merchantId, z.id)} idPrefix={`z-${z.id}`} fields={zoneFields(z)} submitLabel="Guardar zona" />
                    </div>
                  </details>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <Card className="space-y-3 p-4 sm:p-6">
          <h3 className="font-semibold">Nueva zona</h3>
          <FieldsForm action={saveZoneAction.bind(null, merchantId, null)} idPrefix="znew" fields={zoneFields()} submitLabel="Crear zona" resetOnSuccess />
        </Card>
      </section>

      <section id="ajustes" aria-labelledby="ajustes-h" className="scroll-mt-20">
        <Card className="space-y-4 p-4 sm:p-6">
          <h2 id="ajustes-h" className="text-lg font-semibold">Ajustes de venta</h2>
          <FieldsForm
            action={updateSettingsAction.bind(null, merchantId)}
            idPrefix="ajustes"
            submitLabel="Guardar ajustes"
            fields={[
              {
                name: "minOrderAmount",
                label: "Compra mínima general",
                defaultValue: s?.minOrderAmount.toFixed(2) ?? "0",
                inputMode: "decimal",
                hint: "Subtotal mínimo para hacer un pedido (0 = sin mínimo).",
              },
              {
                name: "reservationMinutes",
                label: "Reserva de stock (minutos)",
                type: "number",
                defaultValue: String(s?.reservationMinutes ?? 30),
                min: 10,
                max: 1440,
                hint: "Cuánto tiempo se guardan las unidades de un pedido mientras el cliente paga (10 a 1440).",
              },
              {
                name: "allowCustomerCancelPaid",
                label: "Permitir que el cliente cancele un pedido pagado antes de que empieces a prepararlo",
                type: "checkbox",
                defaultChecked: s?.allowCustomerCancelPaid ?? true,
                hint: "Se le devuelve el dinero automáticamente por Mercado Pago.",
                full: true,
              },
            ]}
          />
        </Card>
      </section>
    </div>
  );
}
