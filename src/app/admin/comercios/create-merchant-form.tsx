"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { createMerchantAction } from "@/app/actions/admin";

const BUSINESS_TYPES = ["Almacén", "Supermercado", "Minimercado", "Farmacia", "Verdulería", "Carnicería", "Bebidas", "Otro"];

export function CreateMerchantForm() {
  return (
    <ActionForm action={createMerchantAction} resetOnSuccess>
      {(f) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del comercio" htmlFor="m-name" error={f.name}>
              <Input id="m-name" name="name" required maxLength={80} autoComplete="organization" aria-invalid={Boolean(f.name)} />
            </Field>
            <Field label="Rubro" htmlFor="m-type" error={f.businessType}>
              <Select id="m-type" name="businessType" defaultValue="Almacén">
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Descripción (opcional)" htmlFor="m-desc" error={f.description}>
            <Textarea id="m-desc" name="description" rows={2} maxLength={1000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono (opcional)" htmlFor="m-phone" error={f.phone}>
              <Input id="m-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" />
            </Field>
            <Field label="Email del comercio (opcional)" htmlFor="m-email" error={f.email}>
              <Input id="m-email" name="email" type="email" maxLength={120} />
            </Field>
          </div>
          <Field
            label="Email del administrador"
            htmlFor="m-admin"
            error={f.adminEmail}
            hint="Va a poder gestionar el comercio cuando ingrese con su cuenta de Google con este email."
          >
            <Input id="m-admin" name="adminEmail" type="email" required maxLength={120} aria-invalid={Boolean(f.adminEmail)} />
          </Field>
          <SubmitButton pendingText="Creando…">Crear comercio</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
