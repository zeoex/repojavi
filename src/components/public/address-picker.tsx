"use client";

import { useRef } from "react";
import { Button, cx } from "@/components/ui";

export type PickerAddress = { id: string; title: string; detail: string; isDefault: boolean };

/**
 * Selector de dirección del checkout. Es un formulario GET (?address=ID): al elegir una opción
 * se envía solo para recalcular el envío; el botón queda como alternativa sin JavaScript.
 */
export function AddressPicker({ addresses, selectedId }: { addresses: PickerAddress[]; selectedId: string | null }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} method="get" className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="sr-only">Dirección de entrega</legend>
        {addresses.map((a) => (
          <label
            key={a.id}
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition",
              a.id === selectedId ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-gray-200 hover:bg-gray-50",
            )}
          >
            <input
              type="radio"
              name="address"
              value={a.id}
              defaultChecked={a.id === selectedId}
              onChange={() => ref.current?.requestSubmit()}
              className="mt-0.5 h-4 w-4 text-brand-600"
            />
            <span>
              <span className="font-semibold text-gray-900">
                {a.title}
                {a.isDefault && <span className="ml-2 text-xs font-medium text-brand-700">(predeterminada)</span>}
              </span>
              <span className="block text-gray-600">{a.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <noscript>
        <Button type="submit" variant="secondary">
          Calcular envío
        </Button>
      </noscript>
    </form>
  );
}
