import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/authz";
import { listOrdersForCustomer } from "@/server/services/orders";
import { EmptyState, LinkButton, PageTitle, StatusBadge } from "@/components/ui";
import { formatARS } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis pedidos" };

export default async function OrdersPage() {
  const actor = await getActor();
  if (!actor) redirect("/ingresar?callbackUrl=/pedidos");
  const orders = await listOrdersForCustomer(actor.userId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Mis pedidos" />
      {orders.length === 0 ? (
        <EmptyState icon="🧾" title="Todavía no hiciste pedidos" description="Cuando compres en un comercio vas a ver acá el estado de tu pedido." action={<LinkButton href="/">Ver comercios</LinkButton>} />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const count = o.items.reduce((a, i) => a + i.quantity, 0);
            return (
              <li key={o.id}>
                <Link
                  href={`/pedidos/${o.id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      Pedido #{o.number} · {o.merchant?.name ?? o.merchantNameSnapshot}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatDateTimeAR(o.createdAt)} · {count} {count === 1 ? "producto" : "productos"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <StatusBadge status={o.status} />
                    <span className="font-bold">{formatARS(o.total)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
