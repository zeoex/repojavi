import { prisma } from "@/lib/db";
import { listCategoriesForMerchant } from "@/server/services/catalog";
import { createCategoryAction, deleteCategoryAction } from "@/app/actions/merchant";
import { ActionButton } from "@/components/forms";
import { FieldsForm } from "../../_components/fields-form";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireMerchantPage } from "../../_lib/guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categorías" };

export default async function CategoriesPage({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  await requireMerchantPage(merchantId, "/categorias");
  const [categories, counts] = await Promise.all([
    listCategoriesForMerchant(merchantId),
    prisma.product.groupBy({ by: ["categoryId"], where: { merchantId, deletedAt: null }, _count: true }),
  ]);
  const countOf = new Map(counts.map((c) => [c.categoryId, c._count]));
  const own = categories.filter((c) => c.merchantId === merchantId);
  const global = categories.filter((c) => c.merchantId === null);

  return (
    <div className="space-y-6">
      <PageTitle title="Categorías" subtitle="Organizá tus productos. Podés usar las categorías de la plataforma o crear las tuyas." />

      <Card className="p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-semibold">Nueva categoría</h2>
        <FieldsForm
          action={createCategoryAction.bind(null, merchantId)}
          idPrefix="cat"
          columns={1}
          inline
          resetOnSuccess
          submitLabel="Crear categoría"
          pendingText="Creando…"
          fields={[{ name: "name", label: "Nombre", required: true, maxLength: 60, placeholder: "Ej: Ofertas de la semana" }]}
        />
      </Card>

      <section className="space-y-3" aria-labelledby="propias">
        <h2 id="propias" className="text-lg font-semibold">Tus categorías</h2>
        {own.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">Todavía no creaste categorías propias.</p>
        ) : (
          <Card>
            <ul className="divide-y divide-gray-100">
              {own.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-gray-500">{countOf.get(c.id) ?? 0} productos</p>
                  </div>
                  <ActionButton
                    action={deleteCategoryAction.bind(null, merchantId, c.id)}
                    variant="ghost"
                    className="text-red-700"
                    confirm={`¿Eliminar la categoría “${c.name}”? Sus productos quedan sin categoría (no se borran).`}
                  >
                    Eliminar
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="globales">
        <h2 id="globales" className="text-lg font-semibold">Categorías de la plataforma</h2>
        <p className="text-sm text-gray-600">Las define Fedexpress y son comunes a todos los comercios. No se pueden editar desde tu panel.</p>
        {global.length === 0 ? (
          <p className="text-sm text-gray-500">No hay categorías de la plataforma.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {global.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                {c.name}
                <Badge tone="violet">Plataforma</Badge>
                <span className="text-xs text-gray-500">{countOf.get(c.id) ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
