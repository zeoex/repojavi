"use client";

import { useActionState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/action";
import { SubmitButton } from "@/components/forms";
import { Alert, Textarea } from "@/components/ui";

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

/** Acción destructiva con motivo opcional (cancelar / reembolsar). Se despliega para evitar clics accidentales. */
export function ReasonActionForm({ action, label, confirm, explanation }: { action: FormAction; label: string; confirm: string; explanation: string }) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const id = useId();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <details className="group w-full rounded-xl border border-red-200 bg-red-50/40 p-3">
      <summary className="cursor-pointer select-none text-sm font-semibold text-red-700">{label}</summary>
      <form action={formAction} className="mt-3 space-y-3">
        <p className="text-sm text-gray-700">{explanation}</p>
        <div className="space-y-1">
          <label htmlFor={id} className="block text-sm font-medium text-gray-700">
            Motivo (opcional, lo ve el cliente)
          </label>
          <Textarea id={id} name="note" rows={2} maxLength={300} placeholder="Ej: nos quedamos sin stock de un producto" />
        </div>
        {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
        <SubmitButton variant="danger" confirm={confirm} pendingText="Procesando…">
          {label}
        </SubmitButton>
      </form>
    </details>
  );
}
