import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicMerchantBySlug } from "@/server/services/merchants";
import { categoriesInUse, listPublicProducts } from "@/server/services/catalog";
import { getActor } from "@/server/authz";
import { Alert, Card, EmptyState } from "@/components/ui";
import { OpenBadge } from "@/components/public/merchant-card";
import { ProductCard } from "@/components/public/product-card";
import { Chip } from "@/components/public/chip";
import { formatARS } from "@/lib/money";
import { dayName } from "@/lib/time";

export const dynamic = "force-dynamic";

type SP = { cat?: string; q?: string; disp?: string };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = await getPublicMerchantBySlug(slug);
  return m ? { title: m.name, description: m.description ?? undefined } : { title: "Comercio no encontrado" };
}

// Lunes primero
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export default async function MerchantPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const merchant = await getPublicMerchantBySlug(slug);
  if (!merchant) notFound();

  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const cat = typeof sp.cat === "string" ? sp.cat : "";
  const onlyAvailable = sp.disp === "1";

  const [actor, categories, products] = await Promise.all([
    getActor(),
    categoriesInUse(merchant.id),
    listPublicProducts(merchant.id, { q: q || undefined, categoryId: cat || undefined, onlyAvailable }),
  ]);

  const base = `/comercios/${merchant.slug}`;
  const href = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const next = { cat, q, disp: onlyAvailable ? "1" : "", ...over };
    if (next.cat) p.set("cat", next.cat);
    if (next.q) p.set("q", next.q);
    if (next.disp) p.set("disp", next.disp);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  const closed = !merchant.isOpen && !merchant.salesPaused;
  const blockedReason = merchant.salesPaused
    ? `${merchant.name} pausó temporalmente sus ventas. Volvé a intentar más tarde.`
    : closed
      ? `${merchant.name} está cerrado ahora. Vas a poder comprar cuando abra (mirá los horarios).`
      : null;
  const loginHref = `/ingresar?callbackUrl=${encodeURIComponent(base)}`;
  const address = [merchant.street && `${merchant.street} ${merchant.streetNumber ?? ""}`.trim(), merchant.city, merchant.province].filter(Boolean).join(", ");
  const minOrder = merchant.settings?.minOrderAmount;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="h-36 bg-gradient-to-br from-brand-100 to-brand-50 sm:h-48">
          {merchant.coverUrl && <img src={merchant.coverUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <div className="-mt-14 h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-white shadow">
            {merchant.logoUrl ? (
              <img src={merchant.logoUrl} alt={`Logo de ${merchant.name}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-brand-50 text-3xl font-bold text-brand-700" aria-hidden>
                {merchant.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{merchant.name}</h1>
              <OpenBadge isOpen={merchant.isOpen} salesPaused={merchant.salesPaused} />
            </div>
            <p className="text-sm text-gray-500">{merchant.businessType}</p>
            {merchant.description && <p className="text-gray-700">{merchant.description}</p>}
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
              {address && <li>📍 {address}</li>}
              {merchant.phone && (
                <li>
                  📞{" "}
                  <a href={`tel:${merchant.phone.replace(/[^\d+]/g, "")}`} className="text-brand-700 hover:underline">
                    {merchant.phone}
                  </a>
                </li>
              )}
              {minOrder && minOrder.greaterThan(0) && <li>Pedido mínimo: {formatARS(minOrder)}</li>}
            </ul>
          </div>
        </div>
      </section>

      {blockedReason && <Alert tone="warning">{blockedReason}</Alert>}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <form method="get" action={base} role="search" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {cat && <input type="hidden" name="cat" value={cat} />}
            <label htmlFor="q-store" className="sr-only">
              Buscar en {merchant.name}
            </label>
            <input
              id="q-store"
              name="q"
              defaultValue={q}
              placeholder={`Buscar en ${merchant.name}`}
              className="w-full flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="disp" value="1" defaultChecked={onlyAvailable} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
              Solo con stock
            </label>
            <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              Filtrar
            </button>
          </form>

          {categories.length > 0 && (
            <nav aria-label="Categorías" className="-mx-4 overflow-x-auto px-4">
              <ul className="flex gap-2 pb-1">
                <li>
                  <Chip href={href({ cat: "" })} active={!cat}>
                    Todo
                  </Chip>
                </li>
                {categories.map((c) => (
                  <li key={c.id}>
                    <Chip href={href({ cat: c.id })} active={cat === c.id}>
                      {c.name}
                    </Chip>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {(q || onlyAvailable) && (
            <p className="text-sm text-gray-600">
              {products.length} {products.length === 1 ? "producto" : "productos"}
              {q && <> para “{q}”</>}
              {onlyAvailable && <> con stock</>} ·{" "}
              <Link href={href({ q: "", disp: "" })} className="font-medium text-brand-700 hover:underline">
                Quitar filtros
              </Link>
            </p>
          )}

          {products.length === 0 ? (
            <EmptyState
              icon="📦"
              title="No hay productos para mostrar"
              description={q || cat || onlyAvailable ? "Probá quitando los filtros o buscando otra cosa." : "Este comercio todavía no cargó productos."}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} mode="buy" purchase={{ loggedIn: !!actor, loginHref, blockedReason }} />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Horarios</h2>
            {merchant.hours.length === 0 ? (
              <p className="text-sm text-gray-600">Este comercio no cargó horarios: recibe pedidos todos los días.</p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Horarios de atención (hora de Argentina)</caption>
                <tbody className="divide-y divide-gray-100">
                  {WEEK.map((d) => {
                    const slots = merchant.hours.filter((h) => h.dayOfWeek === d);
                    return (
                      <tr key={d}>
                        <th scope="row" className="py-1.5 pr-3 text-left font-medium text-gray-700">
                          {dayName(d)}
                        </th>
                        <td className="py-1.5 text-right text-gray-600">{slots.length ? slots.map((s) => `${s.opensAt}–${s.closesAt}`).join(" · ") : "Cerrado"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Zonas de envío</h2>
            {merchant.zones.length === 0 ? (
              <p className="text-sm text-gray-600">Este comercio todavía no configuró zonas de envío.</p>
            ) : (
              <ul className="space-y-3">
                {merchant.zones.map((z) => (
                  <li key={z.id} className="rounded-xl bg-gray-50 p-3 text-sm">
                    <p className="font-semibold text-gray-900">{z.name}</p>
                    <p className="text-gray-600">CP: {z.postalCodes.join(", ")}</p>
                    <p className="text-gray-600">
                      Envío: {z.fee.isZero() ? "gratis" : formatARS(z.fee)}
                      {z.freeShippingOver && <> · Gratis desde {formatARS(z.freeShippingOver)}</>}
                    </p>
                    <p className="text-gray-600">
                      Demora: {z.etaMinMinutes}–{z.etaMaxMinutes} min
                      {z.minOrderAmount.greaterThan(0) && <> · Mínimo {formatARS(z.minOrderAmount)}</>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
