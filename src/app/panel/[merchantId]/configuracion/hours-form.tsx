"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/action";
import { SubmitButton } from "@/components/forms";
import { Alert, Button, Input } from "@/components/ui";

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;
type Range = { opensAt: string; closesAt: string };
export type HoursRow = { dayOfWeek: number; opensAt: string; closesAt: string };

// Lunes primero; 0 = domingo
const DAYS = [
  { dow: 1, name: "Lunes" },
  { dow: 2, name: "Martes" },
  { dow: 3, name: "Miércoles" },
  { dow: 4, name: "Jueves" },
  { dow: 5, name: "Viernes" },
  { dow: 6, name: "Sábado" },
  { dow: 0, name: "Domingo" },
];
const MAX_RANGES = 2;

export function HoursForm({ action, initial }: { action: FormAction; initial: HoursRow[] }) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const [days, setDays] = useState<Record<number, Range[]>>(() => {
    const out: Record<number, Range[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const h of initial) if (out[h.dayOfWeek].length < MAX_RANGES) out[h.dayOfWeek].push({ opensAt: h.opensAt, closesAt: h.closesAt });
    return out;
  });
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const rows: HoursRow[] = DAYS.flatMap((d) => days[d.dow].map((r) => ({ dayOfWeek: d.dow, ...r })));
  const invalid = rows.some((r) => !r.opensAt || !r.closesAt || r.opensAt === r.closesAt);
  const allClosed = rows.length === 0;

  const setRange = (dow: number, i: number, patch: Partial<Range>) =>
    setDays((d) => ({ ...d, [dow]: d[dow].map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  function copyMondayToWeekdays() {
    setDays((d) => ({ ...d, 2: d[1].map((r) => ({ ...r })), 3: d[1].map((r) => ({ ...r })), 4: d[1].map((r) => ({ ...r })), 5: d[1].map((r) => ({ ...r })) }));
  }

  return (
    <form
      action={formAction}
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        if (invalid) e.preventDefault();
      }}
    >
      <input type="hidden" name="payload" value={JSON.stringify(rows)} />
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      {state?.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <p className="text-sm text-gray-600">
        Hora de Argentina. Hasta {MAX_RANGES} franjas por día (por ejemplo, 9:00–13:00 y 17:00–21:00). Una franja que termina antes de empezar cruza la medianoche (ej.
        20:00–02:00).
      </p>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
        {DAYS.map((d) => {
          const ranges = days[d.dow];
          return (
            <li key={d.dow} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
              <div className="flex items-center justify-between sm:w-40 sm:pt-2">
                <span className="font-medium">{d.name}</span>
                {ranges.length === 0 && <span className="text-sm text-gray-500 sm:hidden">Cerrado</span>}
              </div>
              <div className="flex-1 space-y-2">
                {ranges.length === 0 && <p className="hidden pt-2 text-sm text-gray-500 sm:block">Cerrado</p>}
                {ranges.map((r, i) => {
                  const bad = !r.opensAt || !r.closesAt || r.opensAt === r.closesAt;
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`h-${d.dow}-${i}-o`}>
                        {d.name}, franja {i + 1}: abre
                      </label>
                      <Input id={`h-${d.dow}-${i}-o`} type="time" value={r.opensAt} onChange={(e) => setRange(d.dow, i, { opensAt: e.target.value })} className="w-32" aria-invalid={bad} />
                      <span aria-hidden>a</span>
                      <label className="sr-only" htmlFor={`h-${d.dow}-${i}-c`}>
                        {d.name}, franja {i + 1}: cierra
                      </label>
                      <Input id={`h-${d.dow}-${i}-c`} type="time" value={r.closesAt} onChange={(e) => setRange(d.dow, i, { closesAt: e.target.value })} className="w-32" aria-invalid={bad} />
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3 py-1.5 text-red-700"
                        onClick={() => setDays((dd) => ({ ...dd, [d.dow]: dd[d.dow].filter((_, j) => j !== i) }))}
                        aria-label={`Quitar franja ${i + 1} del ${d.name}`}
                      >
                        Quitar
                      </Button>
                      {bad && <span className="w-full text-xs font-medium text-red-600">Completá apertura y cierre (no pueden ser iguales).</span>}
                    </div>
                  );
                })}
                {ranges.length < MAX_RANGES && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1.5"
                    onClick={() =>
                      setDays((dd) => ({
                        ...dd,
                        [d.dow]: [...dd[d.dow], ranges.length === 0 ? { opensAt: "09:00", closesAt: "18:00" } : { opensAt: "17:00", closesAt: "21:00" }],
                      }))
                    }
                  >
                    {ranges.length === 0 ? "Abrir este día" : "Agregar franja"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {allClosed && (
        <Alert tone="warning">
          Sin horarios cargados, tu tienda figura <strong>siempre abierta</strong>. Si querés dejar de recibir pedidos por un tiempo, usá “Pausar ventas”.
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Guardando…">Guardar horarios</SubmitButton>
        <Button type="button" variant="ghost" onClick={copyMondayToWeekdays}>
          Copiar el lunes a martes–viernes
        </Button>
      </div>
      {invalid && <p className="text-xs font-medium text-red-600">Revisá las franjas marcadas antes de guardar.</p>}
    </form>
  );
}
