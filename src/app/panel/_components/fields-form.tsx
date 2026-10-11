"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea, cx } from "@/components/ui";
import type { ActionResult } from "@/server/action";

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "url" | "number" | "password" | "textarea" | "select" | "checkbox";
  defaultValue?: string;
  defaultChecked?: boolean;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email" | "url";
  autoComplete?: string;
  options?: { value: string; label: string; disabled?: boolean }[];
  /** Ocupa todo el ancho de la grilla */
  full?: boolean;
};

/**
 * Formulario declarativo para páginas de servidor: recibe la descripción (serializable) de los campos
 * y muestra los errores por campo devueltos por la acción.
 */
export function FieldsForm({
  action,
  fields: specs,
  submitLabel,
  pendingText = "Guardando…",
  resetOnSuccess,
  idPrefix,
  columns = 2,
  submitVariant,
  confirm,
  inline,
}: {
  action: FormAction;
  fields: FieldSpec[];
  submitLabel: string;
  pendingText?: string;
  resetOnSuccess?: boolean;
  idPrefix: string;
  columns?: 1 | 2 | 3;
  submitVariant?: "primary" | "secondary" | "danger" | "ghost" | "accent";
  confirm?: string;
  /** Campos y botón en una sola fila (en pantallas medianas) */
  inline?: boolean;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={resetOnSuccess}>
      {(errors) => (
        <div className={cx(inline ? "flex flex-col gap-3 sm:flex-row sm:items-end" : "space-y-4")}>
          <div
            className={cx(
              "grid gap-3",
              inline && "flex-1",
              columns === 2 && "sm:grid-cols-2",
              columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {specs.map((f) => {
              const id = `${idPrefix}-${f.name}`;
              const err = errors[f.name];
              const span = f.full ? (columns === 3 ? "sm:col-span-2 lg:col-span-3" : columns === 2 ? "sm:col-span-2" : "") : "";
              if (f.type === "checkbox") {
                return (
                  <div key={f.name} className={cx("space-y-1", span)}>
                    <label htmlFor={id} className="flex items-start gap-2 text-sm font-medium text-gray-700">
                      <input id={id} name={f.name} type="checkbox" defaultChecked={f.defaultChecked} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                      <span>{f.label}</span>
                    </label>
                    {f.hint && <p className="pl-6 text-xs text-gray-500">{f.hint}</p>}
                    {err && <p className="pl-6 text-xs font-medium text-red-600">{err}</p>}
                  </div>
                );
              }
              const common = {
                id,
                name: f.name,
                defaultValue: f.defaultValue,
                required: f.required,
                placeholder: f.placeholder,
                "aria-invalid": err ? true : undefined,
              };
              return (
                <div key={f.name} className={span}>
                  <Field label={f.label} htmlFor={id} error={err} hint={f.hint}>
                    {f.type === "textarea" ? (
                      <Textarea {...common} rows={3} maxLength={f.maxLength} />
                    ) : f.type === "select" ? (
                      <Select {...common}>
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value} disabled={o.disabled}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        {...common}
                        type={f.type ?? "text"}
                        maxLength={f.maxLength}
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        inputMode={f.inputMode}
                        autoComplete={f.autoComplete}
                      />
                    )}
                  </Field>
                </div>
              );
            })}
          </div>
          <div>
            <SubmitButton pendingText={pendingText} variant={submitVariant} confirm={confirm}>
              {submitLabel}
            </SubmitButton>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
