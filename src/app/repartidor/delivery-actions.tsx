"use client";

import { useState } from "react";
import type { DeliveryStatus } from "@prisma/client";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Button, Field, Textarea } from "@/components/ui";
import { courierDeliveryAction } from "@/app/actions/courier";

export function DeliveryActions({ deliveryId, orderNumber, status }: { deliveryId: string; orderNumber: number; status: DeliveryStatus }) {
  const [failOpen, setFailOpen] = useState(false);

  if (status === "ASSIGNED") {
    return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <ActionButton action={courierDeliveryAction.bind(null, deliveryId, "accept")} variant="primary" pendingText="Aceptando…" className="w-full sm:w-auto">
          Aceptar entrega
        </ActionButton>
        <ActionButton action={courierDeliveryAction.bind(null, deliveryId, "pickup")} variant="secondary" pendingText="Guardando…" className="w-full sm:w-auto">
          Retiré el pedido
        </ActionButton>
      </div>
    );
  }

  if (status === "ACCEPTED") {
    return (
      <ActionButton action={courierDeliveryAction.bind(null, deliveryId, "pickup")} variant="primary" pendingText="Guardando…" className="w-full sm:w-auto">
        Retiré el pedido
      </ActionButton>
    );
  }

  if (status === "PICKED_UP") {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <ActionButton
            action={courierDeliveryAction.bind(null, deliveryId, "deliver")}
            variant="primary"
            pendingText="Confirmando…"
            confirm={`¿Confirmás que entregaste el pedido #${orderNumber}?`}
            className="w-full sm:w-auto"
          >
            Entregado
          </ActionButton>
          {!failOpen && (
            <Button type="button" variant="secondary" onClick={() => setFailOpen(true)}>
              No se pudo entregar
            </Button>
          )}
        </div>
        {failOpen && (
          <div id={`fail-${deliveryId}`} className="rounded-xl border border-red-200 bg-red-50 p-3">
            <ActionForm action={courierDeliveryAction.bind(null, deliveryId, "fail")}>
              {(f) => (
                <>
                  <Field label="¿Qué pasó?" htmlFor={`note-${deliveryId}`} error={f.note} hint="Ej: no atendía nadie, dirección incorrecta. El pedido vuelve al comercio.">
                    <Textarea id={`note-${deliveryId}`} name="note" rows={2} required minLength={3} maxLength={300} aria-invalid={Boolean(f.note)} autoFocus />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton variant="danger" pendingText="Enviando…">
                      Confirmar que no se pudo entregar
                    </SubmitButton>
                    <Button type="button" variant="ghost" onClick={() => setFailOpen(false)}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}
            </ActionForm>
          </div>
        )}
      </div>
    );
  }

  return null;
}
