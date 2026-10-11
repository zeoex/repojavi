import Link from "next/link";
import { getActor } from "@/server/authz";
import { cartCount } from "@/server/services/cart";
import { merchantIdsFor, courierFor } from "@/server/actor";
import { UserMenu } from "./user-menu";
import { Logo } from "./logo";

export async function Header() {
  const actor = await getActor();
  const [count, merchants, couriers] = actor
    ? await Promise.all([cartCount(actor.userId), merchantIdsFor(actor.userId), courierFor(actor.userId)])
    : [0, [], []];
  const links: { href: string; label: string }[] = [];
  if (actor) links.push({ href: "/pedidos", label: "Mis pedidos" }, { href: "/cuenta/direcciones", label: "Mis direcciones" });
  if (merchants.length) links.push({ href: "/panel", label: "Panel de mi comercio" });
  if (couriers.length) links.push({ href: "/repartidor", label: "Mis entregas" });
  if (actor?.platformRole === "SUPERADMIN") links.push({ href: "/admin", label: "Administración" });

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0" aria-label="Fedexpress, inicio">
          <Logo />
        </Link>
        <form action="/buscar" className="hidden flex-1 md:block" role="search">
          <label htmlFor="q-header" className="sr-only">
            Buscar comercios o productos
          </label>
          <input
            id="q-header"
            name="q"
            placeholder="Buscá comercios o productos (ej: yerba, leche)"
            className="w-full max-w-xl rounded-full border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </form>
        <nav className="ml-auto flex items-center gap-2">
          <Link href="/buscar" className="rounded-full p-2 text-gray-700 hover:bg-gray-100 md:hidden" aria-label="Buscar">
            🔍
          </Link>
          {actor ? (
            <>
              <Link href="/carrito" className="relative rounded-full px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100" aria-label={`Carrito, ${count} productos`}>
                🛒<span className="ml-1 hidden sm:inline">Carrito</span>
                {count > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-xs font-bold text-white">{count}</span>
                )}
              </Link>
              <UserMenu name={actor.name ?? actor.email} image={actor.image ?? null} links={links} />
            </>
          ) : (
            <Link href="/ingresar" className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Ingresar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
