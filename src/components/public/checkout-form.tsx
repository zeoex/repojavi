"use client";

import type { ActionResult } from "@/server/action";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Field, Input } from "@/components/ui";

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

export function CheckoutForm({
  action,
  idempotencyKey,
  addressId,
  defaultName,
  defaultPhone,
  merchantName,
  totalLabel,
  blockers,
}: {
  action: FormAction;
  idempotencyKey: string;
  addressId: string;
  defaultName: string;
  defaultPhone: string;
  merchantName: string;
  totalLabel: string;
  blockers: string[];
}) {
  return (
    <ActionForm action={action}>
      {(errors) => (
        <>
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="addressId" value={addressId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre de quien recibe" htmlFor="contactName" error={errors.contactName}>
              <Input id="contactName" name="contactName" required maxLength={80} autoComplete="name" defaultValue={defaultName} />
            </Field>
            <Field label="Teléfono de contacto" htmlFor="contactPhone" error={errors.contactPhone} hint="El comercio y el repartidor te pueden llamar.">
              <Input id="contactPhone" name="contactPhone" type="tel" required maxLength={30} autoComplete="tel" defaultValue={defaultPhone} />
            </Field>
          </div>
          {errors.addressId && <p className="text-sm font-medium text-red-600">{errors.addressId}</p>}
          <Alert tone="info">
            Vas a pagar con Mercado Pago a <strong>{merchantName}</strong>. Fedexpress no guarda datos de tu tarjeta.
          </Alert>
          {blockers.length > 0 ? (
            <div className="space-y-2">
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-700" role="alert">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <button type="button" disabled className="w-full cursor-not-allowed rounded-xl bg-brand-200 px-4 py-3 text-sm font-semibold text-white">
                Confirmar y pagar {totalLabel}
              </button>
            </div>
          ) : (
            <SubmitButton className="w-full py-3" pendingText="Creando tu pedido…">
              Confirmar y pagar {totalLabel}
            </SubmitButton>
          )}
          <p className="text-xs text-gray-500">Al confirmar reservamos el stock por un tiempo limitado mientras completás el pago en Mercado Pago.</p>
        </>
      )}
    </ActionForm>
  );
}
