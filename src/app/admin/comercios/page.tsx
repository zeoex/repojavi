import Link from "next/link";
import { listMerchantsAdmin } from "@/server/services/platform";
import { formatDateTimeAR } from "@/lib/time";
import { Badge, Card, EmptyState, PageTitle, Table, Td } from "@/components/ui";
import { requireAdminPage } from "../_auth";
import { MERCHANT_STATUS } from "../_shared";
import { CreateMerchantForm } from "./create-merchant-form";

export const metadata = { title: "Comercios" };


export default async function AdminMerchantsPage() {
  const actor = await requireAdminPage("/admin/comercios");
  const merchants = await listMerchantsAdmin(actor);
  return (
    <div className="space-y-8">
      <PageTitle title="Comercios" subtitle={`${merchants.length} comercios registrados (incluye suspendidos y eliminados).`} />

      {merchants.length === 0 ? (
        <EmptyState icon="🏪" title="Todavía no hay comercios" description="Creá el primero con el formulario de abajo." />
      ) : (
        <Table head={["Comercio", "Rubro", "Estado", "Destacado", "Admins", "Mercado Pago", "Pedidos", "Alta"]}>
          {merchants.map((m) => (
            <tr key={m.id} className={m.deletedAt ? "bg-gray-50 text-gray-500" : undefined}>
              <Td>
                <Link href={`/admin/comercios/${m.id}`} className="font-semibold text-brand-700 hover:underline">
                  {m.name}
                </Link>
                {m.deletedAt && (
                  <Badge tone="gray" className="ml-2">
                    Eliminado
                  </Badge>
                )}
              </Td>
              <Td>{m.businessType}</Td>
              <Td>
                <Badge tone={MERCHANT_STATUS[m.status].tone}>{MERCHANT_STATUS[m.status].label}</Badge>
                {m.salesPaused && !m.deletedAt && (
                  <Badge tone="amber" className="ml-1">
                    Ventas pausadas
                  </Badge>
                )}
              </Td>
              <Td>{m.featured ? <Badge tone="violet">★ Destacado</Badge> : <span className="text-gray-400">No</span>}</Td>
              <Td>{m._count.members}</Td>
              <Td>
                {m.paymentAccount?.status === "CONNECTED" ? (
                  <Badge tone="green">Conectado</Badge>
                ) : m.paymentAccount ? (
                  <Badge tone="red">Con problemas</Badge>
                ) : (
                  <Badge tone="gray">No conectado</Badge>
                )}
              </Td>
              <Td>{m._count.orders}</Td>
              <Td>{formatDateTimeAR(m.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}

      <section aria-labelledby="nuevo-comercio">
        <Card className="p-4 sm:p-6">
          <h2 id="nuevo-comercio" className="mb-4 text-lg font-semibold text-gray-900">
            Crear comercio
          </h2>
          <CreateMerchantForm />
        </Card>
      </section>
    </div>
  );
}
