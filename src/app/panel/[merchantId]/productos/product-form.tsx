"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { ActionResult } from "@/server/action";
import { SubmitButton } from "@/components/forms";
import { Alert, Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";

type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;
type UploadAction = (prev: ActionResult<{ url: string }> | null, fd: FormData) => Promise<ActionResult<{ url: string }>>;

export type VariantDraft = {
  id?: string;
  name: string;
  sku: string;
  price: string;
  promoPrice: string;
  stock: string;
  minStock: string;
  active: boolean;
  /** Unidades reservadas por pedidos pendientes (solo lectura) */
  reserved?: number;
};

export type ProductDraft = {
  name: string;
  description: string;
  categoryId: string;
  active: boolean;
  featured: boolean;
  imageUrls: string[];
  variants: VariantDraft[];
};

type Row = VariantDraft & { key: string };

const MAX_IMAGES = 8;
const MAX_VARIANTS = 30;

let seq = 0;
const newKey = () => `k${++seq}`;

function emptyVariant(): VariantDraft {
  return { name: "Única", sku: "", price: "", promoPrice: "", stock: "0", minStock: "", active: true };
}

export function ProductForm({
  action,
  uploadAction,
  categories,
  initial,
  cancelHref,
  isNew,
}: {
  action: FormAction;
  uploadAction?: UploadAction;
  categories: { id: string; name: string; global: boolean }[];
  initial: ProductDraft;
  cancelHref: string;
  isNew: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  const uid = useId();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [active, setActive] = useState(initial.active);
  const [featured, setFeatured] = useState(initial.featured);
  const [images, setImages] = useState<{ key: string; url: string }[]>(() => initial.imageUrls.map((url) => ({ key: newKey(), url })));
  const [variants, setVariants] = useState<Row[]>(() => (initial.variants.length ? initial.variants : [emptyVariant()]).map((v) => ({ ...v, key: newKey() })));

  const [uploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const payload = {
    name,
    description,
    categoryId: categoryId || null,
    active,
    featured,
    imageUrls: images.map((i) => i.url.trim()).filter(Boolean),
    variants: variants.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      name: v.name,
      sku: v.sku,
      price: v.price,
      promoPrice: v.promoPrice.trim() || null,
      stock: v.stock.trim() === "" ? 0 : v.stock,
      minStock: v.minStock.trim() === "" ? null : v.minStock,
      active: v.active,
    })),
  };

  function updateVariant(key: string, patch: Partial<VariantDraft>) {
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadAction) return;
    setUploadError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("Formato no permitido: usá JPG, PNG o WEBP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("La imagen supera los 2 MB.");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    startUpload(async () => {
      const r = await uploadAction(null, fd);
      if (r.ok && r.data) setImages((imgs) => [...imgs, { key: newKey(), url: r.data!.url }]);
      else if (!r.ok) setUploadError(r.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  // Errores de imágenes: "imageUrls.N" → índice de la lista filtrada (coincide si no hay filas vacías intermedias)
  const imgError = Object.entries(fields).find(([k]) => k.startsWith("imageUrls"))?.[1];
  const variantsError = fields["variants"];

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}

      <Card className="space-y-4 p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Datos del producto</h2>
        <Field label="Nombre" htmlFor={`${uid}-name`} error={fields.name}>
          <Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required aria-invalid={Boolean(fields.name)} />
        </Field>
        <Field label="Descripción (opcional)" htmlFor={`${uid}-desc`} error={fields.description}>
          <Textarea id={`${uid}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
        </Field>
        <Field label="Categoría" htmlFor={`${uid}-cat`} error={fields.categoryId} hint="Podés crear categorías propias en la sección Categorías.">
          <Select id={`${uid}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.global ? "" : " (propia)"}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            Activo (visible en la tienda)
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            Destacado
          </label>
        </div>
      </Card>

      <Card className="space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Imágenes</h2>
          <p className="text-sm text-gray-600">
            Hasta {MAX_IMAGES} imágenes. La primera es la principal.{" "}
            {uploadAction ? "Podés subir un archivo (JPG, PNG o WEBP, hasta 2 MB) o pegar una URL https." : "Pegá la URL https de la imagen."}
          </p>
        </div>
        {imgError && <p className="text-xs font-medium text-red-600">{imgError}</p>}
        {images.length === 0 && <p className="text-sm text-gray-500">Sin imágenes: en la tienda se muestra un ícono genérico.</p>}
        <ul className="space-y-3">
          {images.map((img, i) => (
            <li key={img.key} className="flex items-center gap-3">
              {/^https:\/\//.test(img.url.trim()) ? (
                <img src={img.url.trim()} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-gray-200 object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xl" aria-hidden>
                  🖼️
                </div>
              )}
              <label htmlFor={`${uid}-img-${img.key}`} className="sr-only">
                URL de la imagen {i + 1}
              </label>
              <Input
                id={`${uid}-img-${img.key}`}
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={img.url}
                onChange={(e) => setImages((imgs) => imgs.map((x) => (x.key === img.key ? { ...x, url: e.target.value } : x)))}
              />
              <Button type="button" variant="ghost" className="shrink-0 px-3 text-red-700" onClick={() => setImages((imgs) => imgs.filter((x) => x.key !== img.key))} aria-label={`Quitar imagen ${i + 1}`}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={images.length >= MAX_IMAGES} onClick={() => setImages((imgs) => [...imgs, { key: newKey(), url: "" }])}>
            Agregar URL de imagen
          </Button>
          {uploadAction && (
            <>
              <label
                htmlFor={`${uid}-file`}
                className={cx(
                  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-within:ring-2 focus-within:ring-brand-200",
                  (uploading || images.length >= MAX_IMAGES) && "pointer-events-none opacity-50",
                )}
              >
                {uploading ? "Subiendo…" : "Subir archivo"}
              </label>
              <input
                ref={fileRef}
                id={`${uid}-file`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={onFile}
                disabled={uploading || images.length >= MAX_IMAGES}
              />
            </>
          )}
        </div>
        {uploadError && (
          <p role="alert" className="text-xs font-medium text-red-600">
            {uploadError}
          </p>
        )}
      </Card>

      <Card className="space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Variantes, precios y stock</h2>
          <p className="text-sm text-gray-600">
            Todo producto tiene al menos una variante (por ejemplo “Única”, o “500 g” y “1 kg”). El precio promocional es opcional y debe ser menor al de lista. El stock es la cantidad física que tenés.
          </p>
        </div>
        {variantsError && <p className="text-xs font-medium text-red-600">{variantsError}</p>}
        <ol className="space-y-4">
          {variants.map((v, i) => {
            const err = (k: string) => fields[`variants.${i}.${k}`];
            const id = (k: string) => `${uid}-v-${v.key}-${k}`;
            return (
              <li key={v.key} className="rounded-xl border border-gray-200 p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-800">
                    Variante {i + 1}
                    {v.id ? "" : " (nueva)"}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-3 py-1.5 text-red-700"
                    disabled={variants.length <= 1}
                    onClick={() => setVariants((rows) => rows.filter((r) => r.key !== v.key))}
                    aria-label={`Quitar variante ${i + 1}`}
                  >
                    Quitar
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Nombre" htmlFor={id("name")} error={err("name")}>
                    <Input id={id("name")} value={v.name} onChange={(e) => updateVariant(v.key, { name: e.target.value })} maxLength={60} />
                  </Field>
                  <Field label="SKU" htmlFor={id("sku")} error={err("sku")}>
                    <Input id={id("sku")} value={v.sku} onChange={(e) => updateVariant(v.key, { sku: e.target.value })} maxLength={40} autoCapitalize="characters" />
                  </Field>
                  <Field label="Precio" htmlFor={id("price")} error={err("price")}>
                    <Input id={id("price")} inputMode="decimal" placeholder="1500,00" value={v.price} onChange={(e) => updateVariant(v.key, { price: e.target.value })} />
                  </Field>
                  <Field label="Precio promocional" htmlFor={id("promo")} error={err("promoPrice")}>
                    <Input id={id("promo")} inputMode="decimal" placeholder="Opcional" value={v.promoPrice} onChange={(e) => updateVariant(v.key, { promoPrice: e.target.value })} />
                  </Field>
                  <Field
                    label="Stock"
                    htmlFor={id("stock")}
                    error={err("stock")}
                    hint={v.reserved ? `${v.reserved} reservadas por pedidos pendientes de pago` : undefined}
                  >
                    <Input id={id("stock")} type="number" min={0} step={1} inputMode="numeric" value={v.stock} onChange={(e) => updateVariant(v.key, { stock: e.target.value })} />
                  </Field>
                  <Field label="Stock mínimo (aviso)" htmlFor={id("min")} error={err("minStock")}>
                    <Input id={id("min")} type="number" min={0} step={1} inputMode="numeric" placeholder="Opcional" value={v.minStock} onChange={(e) => updateVariant(v.key, { minStock: e.target.value })} />
                  </Field>
                  <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium text-gray-700">
                    <input type="checkbox" checked={v.active} onChange={(e) => updateVariant(v.key, { active: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
                    Variante activa
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
        <Button
          type="button"
          variant="secondary"
          disabled={variants.length >= MAX_VARIANTS}
          onClick={() => setVariants((rows) => [...rows, { ...emptyVariant(), name: "", key: newKey() }])}
        >
          Agregar variante
        </Button>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        <SubmitButton pendingText="Guardando…">{isNew ? "Crear producto" : "Guardar cambios"}</SubmitButton>
        <Link href={cancelHref} className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100">
          Cancelar
        </Link>
        {uploading && <span className="self-center text-sm text-gray-600">Esperá a que termine la subida de la imagen.</span>}
      </div>
    </form>
  );
}
