import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/errors";
import { getProductForMerchant, listCategoriesForMerchant } from "@/server/services/catalog";
import { storageConfigured } from "@/server/storage";
import { deleteProductAction, saveProductAction, uploadProductImageAction } from "@/app/actions/merchant";
import { ActionButton } from "@/components/forms";
import { Alert, PageTitle } from "@/components/ui";
import { requireMerchantPage } from "../../../_lib/guard";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar producto" };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ merchantId: string; productId: string }>; searchParams: Promise<{ guardado?: string }> }) {
  const { merchantId, productId } = await params;
  const actor = await requireMerchantPage(merchantId, `/productos/${productId}`);
  const sp = await searchParams;
  let product;
  try {
    product = await getProductForMerchant(actor, merchantId, productId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const categories = await listCategoriesForMerchant(merchantId);
  const base = `/panel/${merchantId}/productos`;

  return (
    <div className="space-y-4">
      <Link href={base} className="text-sm font-medium text-brand-700 hover:underline">
        ← Volver a productos
      </Link>
      <PageTitle
        title={product.name}
        subtitle="Editar producto"
        actions={
          <ActionButton
            action={deleteProductAction.bind(null, merchantId, product.id, true)}
            variant="danger"
            confirm={`¿Eliminar “${product.name}”? Deja de verse en la tienda. Los pedidos anteriores conservan su detalle.`}
          >
            Eliminar producto
          </ActionButton>
        }
      />
      {sp.guardado === "1" && <Alert tone="success">Cambios guardados y publicados.</Alert>}
      <ProductForm
        key={product.updatedAt.toISOString()}
        isNew={false}
        action={saveProductAction.bind(null, merchantId, product.id)}
        uploadAction={storageConfigured() ? uploadProductImageAction.bind(null, merchantId) : undefined}
        categories={categories.map((c) => ({ id: c.id, name: c.name, global: c.merchantId === null }))}
        cancelHref={base}
        initial={{
          name: product.name,
          description: product.description ?? "",
          categoryId: product.categoryId ?? "",
          active: product.active,
          featured: product.featured,
          imageUrls: product.images.map((i) => i.url),
          variants: product.variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            price: v.price.toFixed(2),
            promoPrice: v.promoPrice ? v.promoPrice.toFixed(2) : "",
            stock: String(v.inventory?.quantity ?? 0),
            minStock: v.inventory?.minStock != null ? String(v.inventory.minStock) : "",
            active: v.active,
            reserved: v.inventory?.reserved ?? 0,
          })),
        }}
      />
    </div>
  );
}
