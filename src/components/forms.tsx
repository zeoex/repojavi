"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/action";
import { Alert, Button, cx } from "./ui";

export function SubmitButton({ children, pendingText = "Guardando…", variant, className, confirm }: { children: ReactNode; pendingText?: string; variant?: "primary" | "secondary" | "danger" | "ghost" | "accent"; className?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-current" aria-hidden />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

/**
 * Formulario conectado a una Server Action con manejo de errores, éxito y refresco.
 * children puede ser una función que recibe los errores por campo.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  redirectTo,
}: {
  action: FormAction;
  children: ReactNode | ((fields: Record<string, string>) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  redirectTo?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    }
  }, [state, resetOnSuccess, redirectTo, router]);
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  return (
    <form ref={ref} action={formAction} className={cx("space-y-4", className)} noValidate>
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      {state?.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {typeof children === "function" ? children(fields) : children}
    </form>
  );
}

/** Botón que ejecuta una acción con argumentos ya vinculados (bind) dentro de un mini formulario. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  confirm,
  pendingText = "…",
  className,
}: {
  action: FormAction;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "accent";
  confirm?: string;
  pendingText?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <SubmitButton variant={variant} confirm={confirm} pendingText={pendingText} className={className}>
        {children}
      </SubmitButton>
      {state && !state.ok && <span className="max-w-xs text-xs font-medium text-red-600">{state.error}</span>}
    </form>
  );
}
