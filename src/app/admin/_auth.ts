import "server-only";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/server/authz";
import { isSuperadmin, type Actor } from "@/server/actor";

/**
 * Guardia para cada página de /admin. El layout ya la aplica, pero layouts y páginas se
 * renderizan en paralelo, así que cada página la repite antes de consultar datos.
 */
export async function requireAdminPage(callbackUrl = "/admin"): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(`/ingresar?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (!isSuperadmin(actor)) notFound();
  return actor;
}
