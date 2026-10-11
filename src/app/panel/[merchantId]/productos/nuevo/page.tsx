import Link from "next/link";
import { listCategoriesForMerchant } from "@/server/services/catalog";
import { storageConfigured } from "@/server/storage";
import { saveProductAction, uploadProductImageAction } from "@/app/actions/merchant";
import { PageTitle } from "@/components/ui";
import { requireMerchantPage } from "../../../_lib/guard";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo producto" };

export default async function NewProductPage({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  await requireMerchantPage(merchantId, "/productos/nuevo");
  const categories = await listCategoriesForMerchant(merchantId);
  const base = `/panel/${merchantId}/productos`;
  return (
    <div className="space-y-4">
      <Link href={base} className="text-sm font-medium text-brand-700 hover:underline">
        ← Volver a productos
      </Link>
      <PageTitle title="Nuevo producto" />
      <ProductForm
        isNew
        action={saveProductAction.bind(null, merchantId, null)}
        uploadAction={storageConfigured() ? uploadProductImageAction.bind(null, merchantId) : undefined}
        categories={categories.map((c) => ({ id: c.id, name: c.name, global: c.merchantId === null }))}
        cancelHref={base}
        initial={{
          name: "",
          description: "",
          categoryId: "",
          active: true,
          featured: false,
          imageUrls: [],
          variants: [{ name: "Única", sku: "", price: "", promoPrice: "", stock: "0", minStock: "", active: true }],
        }}
      />
    </div>
  );
}
