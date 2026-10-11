"use client";

import { useActionState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/action";
import { SubmitButton } from "@/components/forms";
import { Input } from "@/components/ui";

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

export function StockCell({ action, quantity, reserved, label }: { action: FormAction; quantity: number; reserved: number; label: string }) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const id = useId();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Stock físico de {label}
        </label>
        <Input id={id} name="quantity" type="number" min={reserved} step={1} inputMode="numeric" defaultValue={quantity} key={quantity} className="w-24 py-1.5" required />
        <SubmitButton variant="secondary" className="px-3 py-1.5" pendingText="…">
          Guardar
        </SubmitButton>
      </div>
      {state && !state.ok && <span className="max-w-[16rem] whitespace-normal text-xs font-medium text-red-600">{state.error}</span>}
      {state?.ok && (
        <span className="text-xs font-medium text-emerald-700" role="status">
          Guardado
        </span>
      )}
    </form>
  );
}
