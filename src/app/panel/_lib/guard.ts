import "server-only";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError } from "@/lib/errors";
import { assertMerchantAccess, getActor, type Actor } from "@/server/authz";

/**
 * Guardia de todas las páginas del panel: exige sesión y acceso al comercio.
 * Un comercio ajeno responde 404 (no se revela su existencia).
 */
export async function requireMerchantPage(merchantId: string, path = ""): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(`/ingresar?callbackUrl=${encodeURIComponent(`/panel/${merchantId}${path}`)}`);
  try {
    await assertMerchantAccess(actor, merchantId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  return actor;
}
