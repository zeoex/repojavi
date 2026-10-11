"use client";

import { useId } from "react";
import type { ActionResult } from "@/server/action";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";

export const AR_PROVINCES = [
  "Ciudad Autónoma de Buenos Aires",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

export type AddressValues = {
  label: string | null;
  street: string;
  streetNumber: string;
  apartment: string | null;
  city: string;
  province: string;
  postalCode: string;
  instructions: string | null;
  contactName: string | null;
  contactPhone: string | null;
  isDefault: boolean;
};

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

/** Formulario de dirección compartido entre "Mis direcciones" y el checkout. */
export function AddressForm({
  action,
  initial,
  submitLabel = "Guardar dirección",
  resetOnSuccess,
  showDefault = true,
  redirectTo,
}: {
  action: FormAction;
  initial?: Partial<AddressValues>;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  showDefault?: boolean;
  redirectTo?: string;
}) {
  const id = useId();
  const f = (k: string) => `${id}-${k}`;
  const province = initial?.province ?? "";
  const provinces = province && !AR_PROVINCES.includes(province) ? [province, ...AR_PROVINCES] : AR_PROVINCES;
  return (
    <ActionForm action={action} resetOnSuccess={resetOnSuccess} redirectTo={redirectTo}>
      {(errors) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre de la dirección (opcional)" htmlFor={f("label")} error={errors.label} hint="Ej: Casa, Trabajo">
              <Input id={f("label")} name="label" defaultValue={initial?.label ?? ""} maxLength={40} />
            </Field>
            <Field label="Código postal" htmlFor={f("postalCode")} error={errors.postalCode} hint="Ej: 1414 o C1414ABC">
              <Input id={f("postalCode")} name="postalCode" defaultValue={initial?.postalCode ?? ""} required maxLength={12} autoComplete="postal-code" />
            </Field>
            <Field label="Calle" htmlFor={f("street")} error={errors.street}>
              <Input id={f("street")} name="street" defaultValue={initial?.street ?? ""} required maxLength={120} autoComplete="address-line1" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Altura" htmlFor={f("streetNumber")} error={errors.streetNumber}>
                <Input id={f("streetNumber")} name="streetNumber" defaultValue={initial?.streetNumber ?? ""} required maxLength={20} inputMode="numeric" />
              </Field>
              <Field label="Piso / Depto" htmlFor={f("apartment")} error={errors.apartment}>
                <Input id={f("apartment")} name="apartment" defaultValue={initial?.apartment ?? ""} maxLength={30} autoComplete="address-line2" />
              </Field>
            </div>
            <Field label="Localidad / Barrio" htmlFor={f("city")} error={errors.city}>
              <Input id={f("city")} name="city" defaultValue={initial?.city ?? ""} required maxLength={80} autoComplete="address-level2" />
            </Field>
            <Field label="Provincia" htmlFor={f("province")} error={errors.province}>
              <Select id={f("province")} name="province" defaultValue={province} required>
                <option value="" disabled>
                  Elegí una provincia
                </option>
                {provinces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre de contacto (opcional)" htmlFor={f("contactName")} error={errors.contactName}>
              <Input id={f("contactName")} name="contactName" defaultValue={initial?.contactName ?? ""} maxLength={80} autoComplete="name" />
            </Field>
            <Field label="Teléfono de contacto (opcional)" htmlFor={f("contactPhone")} error={errors.contactPhone}>
              <Input id={f("contactPhone")} name="contactPhone" type="tel" defaultValue={initial?.contactPhone ?? ""} maxLength={30} autoComplete="tel" />
            </Field>
          </div>
          <Field label="Indicaciones para el repartidor (opcional)" htmlFor={f("instructions")} error={errors.instructions} hint="Ej: timbre que no anda, portón verde">
            <Textarea id={f("instructions")} name="instructions" defaultValue={initial?.instructions ?? ""} rows={2} maxLength={300} />
          </Field>
          {showDefault && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="isDefault" defaultChecked={initial?.isDefault ?? false} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
              Usar como dirección predeterminada
            </label>
          )}
          <SubmitButton>{submitLabel}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
