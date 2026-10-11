import { listBusinessTypes, listPublicMerchants } from "@/server/services/merchants";
import { featuredProducts } from "@/server/services/catalog";
import { EmptyState, LinkButton } from "@/components/ui";
import { Chip } from "@/components/public/chip";
import { MerchantCard } from "@/components/public/merchant-card";
import { ProductCard } from "@/components/public/product-card";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const sp = await searchParams;
  const tipo = typeof sp.tipo === "string" && sp.tipo.trim() ? sp.tipo.trim() : undefined;
  const [types, merchants, products] = await Promise.all([listBusinessTypes(), listPublicMerchants({ type: tipo }), featuredProducts(8)]);
  const featured = tipo ? [] : merchants.filter((m) => m.featured);

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-900 px-5 py-10 text-white sm:px-10 sm:py-14">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">Pedí a los comercios de tu barrio y recibilo en tu casa</h1>
        <p className="mt-3 max-w-xl text-brand-100">Almacenes, verdulerías, farmacias y más. Cada comercio arma y envía su pedido; pagás con Mercado Pago.</p>
        <form action="/buscar" method="get" role="search" className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row">
          <label htmlFor="q-home" className="sr-only">
            Buscar comercios o productos
          </label>
          <input
            id="q-home"
            name="q"
            required
            placeholder="¿Qué necesitás? Ej: yerba, pan, ibuprofeno"
            className="w-full flex-1 rounded-xl border-0 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-brand-200"
          />
          <button type="submit" className="rounded-xl bg-accent-500 px-5 py-3 font-semibold text-white hover:bg-accent-600">
            Buscar
          </button>
        </form>
      </section>

      {types.length > 0 && (
        <nav aria-label="Tipos de comercio" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2 pb-1">
            <li>
              <Chip href="/" active={!tipo}>
                Todos
              </Chip>
            </li>
            {types.map((t) => (
              <li key={t.type}>
                <Chip href={`/?tipo=${encodeURIComponent(t.type)}`} active={tipo === t.type}>
                  {t.type} <span className="text-xs opacity-70">({t.count})</span>
                </Chip>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {featured.length > 0 && (
        <section aria-labelledby="destacados">
          <h2 id="destacados" className="mb-4 text-xl font-bold">
            Comercios destacados
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((m) => (
              <MerchantCard key={m.id} m={m} className="ring-1 ring-brand-200" />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="comercios">
        <h2 id="comercios" className="mb-4 text-xl font-bold">
          {tipo ? tipo : "Todos los comercios"}
        </h2>
        {merchants.length === 0 ? (
          <EmptyState
            icon="🏪"
            title={tipo ? `No hay comercios de tipo “${tipo}”` : "Todavía no hay comercios"}
            description={tipo ? "Probá con otro tipo de comercio." : "Muy pronto vas a poder comprar en los comercios de tu zona."}
            action={tipo ? <LinkButton href="/">Ver todos</LinkButton> : undefined}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {merchants.map((m) => (
              <MerchantCard key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>

      {!tipo && products.length > 0 && (
        <section aria-labelledby="productos">
          <h2 id="productos" className="mb-4 text-xl font-bold">
            Productos destacados
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} mode="link" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
