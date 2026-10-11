import Link from "next/link";
import { availableUnits, listProductsForMerchant } from "@/server/services/catalog";
import { adjustStockAction } from "@/app/actions/merchant";
import { Alert, Badge, Button, EmptyState, Input, LinkButton, PageTitle, Table, Td, cx } from "@/components/ui";
import { requireMerchantPage } from "../../_lib/guard";
import { StockCell } from "./stock-cell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventario" };

const FILTERS = [
  { value: "", label: "Todo" },
  { value: "bajo", label: "Stock bajo" },
  { value: "agotado", label: "Agotados" },
];

export default async function InventoryPage({ params, searchParams }: { params: Promise<{ merchantId: string }>; searchParams: Promise<{ q?: string; filtro?: string }> }) {
  const { merchantId } = await params;
  const actor = await requireMerchantPage(merchantId, "/inventario");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const filtro = sp.filtro === "bajo" || sp.filtro === "agotado" ? sp.filtro : "";
  const products = await listProductsForMerchant(actor, merchantId, { q: q || undefined });

  const rows = products
    .flatMap((p) =>
      p.variants.map((v) => {
        const quantity = v.inventory?.quantity ?? 0;
        const reserved = v.inventory?.reserved ?? 0;
        const available = availableUnits(v.inventory);
        const minStock = v.inventory?.minStock ?? null;
        const out = available <= 0;
        const low = !out && minStock != null && available <= minStock;
        return { product: p, variant: v, quantity, reserved, available, minStock, out, low };
      }),
    )
    .filter((r) => (filtro === "agotado" ? r.out : filtro === "bajo" ? r.low : true))
    .sort((a, b) => a.product.name.localeCompare(b.product.name, "es") || a.variant.sortOrder - b.variant.sortOrder);

  const base = `/panel/${merchantId}/inventario`;
  const qs = (f: string) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (f) u.set("filtro", f);
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Inventario" subtitle="Ajustá el stock físico de cada variante." />
      <Alert tone="info">
        <strong>Stock</strong> es la cantidad física que tenés. <strong>Reservado</strong> son unidades de pedidos pendientes de pago (se liberan si el pago no llega a tiempo).{" "}
        <strong>Disponible</strong> = stock − reservado: es lo que se puede vender. No podés fijar el stock por debajo de lo reservado.
      </Alert>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form method="get" action={base} className="flex gap-2" role="search">
          {filtro && <input type="hidden" name="filtro" value={filtro} />}
          <label htmlFor="q" className="sr-only">
            Buscar producto
          </label>
          <Input id="q" name="q" type="search" defaultValue={q} placeholder="Buscar producto…" className="max-w-xs" />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <nav aria-label="Filtrar inventario">
          <ul className="flex gap-2">
            {FILTERS.map((f) => (
              <li key={f.value}>
                <Link
                  href={qs(f.value)}
                  aria-current={filtro === f.value ? "true" : undefined}
                  className={cx(
                    "inline-block rounded-full border px-3 py-1.5 text-sm font-medium",
                    filtro === f.value ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {f.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="📦"
          title={products.length === 0 && !q ? "Todavía no cargaste productos" : "No hay variantes para mostrar"}
          description={filtro === "agotado" ? "No tenés variantes agotadas." : filtro === "bajo" ? "Ninguna variante está por debajo de su stock mínimo." : undefined}
          action={products.length === 0 && !q ? <LinkButton href={`/panel/${merchantId}/productos/nuevo`}>Nuevo producto</LinkButton> : undefined}
        />
      ) : (
        <Table head={["Producto", "Variante", "SKU", "Reservado", "Disponible", "Mínimo", "Estado", "Stock físico"]}>
          {rows.map((r) => (
            <tr key={r.variant.id} className={cx(r.out && "bg-red-50/40")}>
              <Td className="min-w-[10rem] whitespace-normal">
                <Link href={`/panel/${merchantId}/productos/${r.product.id}`} className="font-medium hover:text-brand-700 hover:underline">
                  {r.product.name}
                </Link>
                {!r.product.active && <span className="block text-xs text-gray-500">Producto pausado</span>}
              </Td>
              <Td>
                {r.variant.name}
                {!r.variant.active && <span className="block text-xs text-gray-500">Variante inactiva</span>}
              </Td>
              <Td className="font-mono text-xs">{r.variant.sku}</Td>
              <Td>{r.reserved}</Td>
              <Td className="font-semibold">{r.available}</Td>
              <Td>{r.minStock ?? <span className="text-gray-400">—</span>}</Td>
              <Td>{r.out ? <Badge tone="red">Agotado</Badge> : r.low ? <Badge tone="amber">Stock bajo</Badge> : <Badge tone="green">OK</Badge>}</Td>
              <Td>
                <StockCell
                  action={adjustStockAction.bind(null, merchantId, r.variant.id)}
                  quantity={r.quantity}
                  reserved={r.reserved}
                  label={`${r.product.name} ${r.variant.name}`}
                />
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
