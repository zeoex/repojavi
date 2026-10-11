import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/authz";
import { listCarts } from "@/server/services/cart";
import { Alert, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis carritos" };

export default async function CartsPage() {
  const actor = await getActor();
  if (!actor) redirect("/ingresar?callbackUrl=/carrito");
  const carts = await listCarts(actor.userId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Mis carritos" subtitle="Cada comercio tiene su propio carrito y se paga por separado." />
      {carts.length === 0 ? (
        <EmptyState title="Tu carrito está vacío" description="Elegí un comercio y agregá productos para armar tu pedido." action={<LinkButton href="/">Ver comercios</LinkButton>} />
      ) : (
        <div className="space-y-4">
          {carts.length > 1 && <Alert tone="info">Tenés productos de {carts.length} comercios. Cada pedido se arma, se paga y se envía por separado.</Alert>}
          <ul className="space-y-3">
            {carts.map((c) => (
              <li key={c.id}>
                <Card className="flex items-center gap-4 p-4">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                    {c.merchant.logoUrl ? (
                      <img src={c.merchant.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold text-brand-700" aria-hidden>
                        {c.merchant.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/comercios/${c.merchant.slug}`} className="font-semibold text-gray-900 hover:text-brand-700">
                      {c.merchant.name}
                    </Link>
                    <p className="text-sm text-gray-600">
                      {c.itemCount} {c.itemCount === 1 ? "producto" : "productos"}
                    </p>
                  </div>
                  <LinkButton href={`/carrito/${c.merchant.id}`} aria-label={`Ver carrito de ${c.merchant.name}`}>
                    Ver carrito
                  </LinkButton>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
