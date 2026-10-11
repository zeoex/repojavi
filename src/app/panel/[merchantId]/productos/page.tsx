import Link from "next/link";
import { effectivePrice, formatARS } from "@/lib/money";
import { availableUnits, listProductsForMerchant } from "@/server/services/catalog";
import { deleteProductAction, setProductActiveAction } from "@/app/actions/merchant";
import { ActionButton } from "@/components/forms";
import { Alert, Badge, Button, EmptyState, Input, LinkButton, PageTitle, ProductImage, Table, Td } from "@/components/ui";
import { requireMerchantPage } from "../../_lib/guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Productos" };

export default async function MerchantProductsPage({ params, searchParams }: { params: Promise<{ merchantId: string }>; searchParams: Promise<{ q?: string; creado?: string }> }) {
  const { merchantId } = await params;
  const actor = await requireMerchantPage(merchantId, "/productos");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const products = await listProductsForMerchant(actor, merchantId, { q: q || undefined });
  const base = `/panel/${merchantId}/productos`;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Productos"
        subtitle="Los cambios se publican en tu tienda apenas guardás."
        actions={<LinkButton href={`${base}/nuevo`}>Nuevo producto</LinkButton>}
      />
      {sp.creado === "1" && <Alert tone="success">Producto creado.</Alert>}
      <form method="get" action={base} className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Buscar productos
        </label>
        <Input id="q" name="q" type="search" defaultValue={q} placeholder="Buscar por nombre…" className="max-w-sm" />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {products.length === 0 ? (
        <EmptyState
          icon="📦"
          title={q ? "No encontramos productos" : "Todavía no cargaste productos"}
          description={q ? `No hay productos que coincidan con “${q}”.` : "Cargá tu primer producto para empezar a vender."}
          action={q ? <LinkButton href={base} variant="secondary">Ver todos</LinkButton> : <LinkButton href={`${base}/nuevo`}>Nuevo producto</LinkButton>}
        />
      ) : (
        <Table head={["", "Producto", "Categoría", "Precio", "Disponible", "Estado", "Acciones"]}>
          {products.map((p) => {
            const prices = p.variants.map((v) => effectivePrice(v.price, v.promoPrice));
            const min = prices.reduce((a, b) => (b.lessThan(a) ? b : a), prices[0]);
            const max = prices.reduce((a, b) => (b.greaterThan(a) ? b : a), prices[0]);
            const single = p.variants.length === 1 ? p.variants[0] : null;
            const stock = p.variants.reduce((a, v) => a + availableUnits(v.inventory), 0);
            return (
              <tr key={p.id} className="hover:bg-gray-50">
                <Td className="w-16">
                  <ProductImage src={p.images[0]?.url} alt={p.name} className="h-12 w-12 rounded-lg text-xl" />
                </Td>
                <Td className="min-w-[12rem] whitespace-normal">
                  <Link href={`${base}/${p.id}`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">
                    {p.name}
                  </Link>
                  <span className="block text-xs text-gray-500">
                    {p.variants.length} {p.variants.length === 1 ? "variante" : "variantes"}
                    {p.featured && " · Destacado"}
                  </span>
                </Td>
                <Td>{p.category?.name ?? <span className="text-gray-400">Sin categoría</span>}</Td>
                <Td>
                  {prices.length === 0 ? (
                    "—"
                  ) : single ? (
                    single.promoPrice && single.promoPrice.lessThan(single.price) ? (
                      <>
                        <span className="font-medium">{formatARS(single.promoPrice)}</span>{" "}
                        <s className="text-xs text-gray-500">{formatARS(single.price)}</s>
                      </>
                    ) : (
                      formatARS(single.price)
                    )
                  ) : min.equals(max) ? (
                    formatARS(min)
                  ) : (
                    `${formatARS(min)} – ${formatARS(max)}`
                  )}
                </Td>
                <Td>
                  {stock === 0 ? <Badge tone="red">Agotado</Badge> : stock}
                </Td>
                <Td>{p.active ? <Badge tone="green">Activo</Badge> : <Badge>Pausado</Badge>}</Td>
                <Td>
                  <div className="flex flex-wrap items-start gap-2">
                    <LinkButton href={`${base}/${p.id}`} variant="secondary" className="px-3 py-1.5">
                      Editar
                    </LinkButton>
                    <ActionButton action={setProductActiveAction.bind(null, merchantId, p.id, !p.active)} className="px-3 py-1.5">
                      {p.active ? "Pausar" : "Activar"}
                    </ActionButton>
                    <ActionButton
                      action={deleteProductAction.bind(null, merchantId, p.id, false)}
                      variant="ghost"
                      className="px-3 py-1.5 text-red-700"
                      confirm={`¿Eliminar “${p.name}”? Deja de verse en la tienda y se quita de los carritos. Los pedidos anteriores conservan su detalle.`}
                    >
                      Eliminar
                    </ActionButton>
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
