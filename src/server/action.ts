import "server-only";
import { AppError, ValidationError, toPublicMessage } from "@/lib/errors";
import { systemEvent } from "@/server/services/audit";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fields?: Record<string, string> };

/**
 * Envoltorio para Server Actions: convierte errores de dominio en mensajes seguros y
 * registra errores inesperados sin exponer detalles internos al navegador.
 * (Next.js valida el origen de las Server Actions: protección CSRF incorporada.)
 */
export async function runAction<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (e) {
    // redirect()/notFound() de Next se propagan
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    if (e instanceof ValidationError) return { ok: false, error: e.message, fields: e.fields };
    if (!(e instanceof AppError)) await systemEvent("error", "app", "Error inesperado en acción", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: toPublicMessage(e) };
  }
}

/** Lee checkbox de FormData */
export function fdBool(fd: FormData, k: string) {
  const v = fd.get(k);
  return v === "on" || v === "true" || v === "1";
}

export function fdStr(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
}
