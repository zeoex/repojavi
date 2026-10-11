import type { Metadata } from "next";
import { listPublicMerchants } from "@/server/services/merchants";
import { searchPublicProducts } from "@/server/services/catalog";
import { EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { MerchantCard } from "@/components/public/merchant-card";
import { ProductCard } from "@/components/public/product-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Buscar" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const [merchants, products] = q.length >= 2 ? await Promise.all([listPublicMerchants({ q }), searchPublicProducts(q, 24)]) : [[], []];

  return (
    <div className="space-y-8">
      <PageTitle title="Buscar" subtitle={q ? `Resultados para “${q}”` : "Buscá comercios o productos"} />
      <form action="/buscar" method="get" role="search" className="flex max-w-xl gap-2">
        <label htmlFor="q-buscar" className="sr-only">
          Buscar comercios o productos
        </label>
        <input
          id="q-buscar"
          name="q"
          defaultValue={q}
          minLength={2}
          required
          placeholder="Ej: yerba, leche, farmacia"
          className="w-full flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          Buscar
        </button>
      </form>

      {q.length < 2 ? (
        <EmptyState icon="🔍" title="¿Qué estás buscando?" description="Ingresá al menos 2 letras para buscar comercios y productos." />
      ) : merchants.length === 0 && products.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No encontramos resultados"
          description={`No hay comercios ni productos que coincidan con “${q}”. Probá con otra palabra.`}
          action={<LinkButton href="/">Ver todos los comercios</LinkButton>}
        />
      ) : (
        <>
          <section aria-labelledby="res-comercios">
            <h2 id="res-comercios" className="mb-4 text-xl font-bold">
              Comercios <span className="text-base font-normal text-gray-500">({merchants.length})</span>
            </h2>
            {merchants.length === 0 ? (
              <p className="text-sm text-gray-600">Ningún comercio coincide con tu búsqueda.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {merchants.map((m) => (
                  <MerchantCard key={m.id} m={m} />
                ))}
              </div>
            )}
          </section>
          <section aria-labelledby="res-productos">
            <h2 id="res-productos" className="mb-4 text-xl font-bold">
              Productos <span className="text-base font-normal text-gray-500">({products.length})</span>
            </h2>
            {products.length === 0 ? (
              <p className="text-sm text-gray-600">Ningún producto coincide con tu búsqueda.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} mode="link" />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
