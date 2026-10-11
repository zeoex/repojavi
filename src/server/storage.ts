import "server-only";
import { ConflictError, ValidationError } from "@/lib/errors";

// Subida de imágenes a Supabase Storage (opcional). La clave de servicio nunca se registra ni se expone.

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function cfg() {
  return {
    url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    bucket: process.env.SUPABASE_STORAGE_BUCKET || "",
  };
}

export function storageConfigured() {
  const c = cfg();
  return Boolean(c.url && c.key && c.bucket);
}

export async function uploadImage(merchantId: string, file: File): Promise<string> {
  if (!storageConfigured()) throw new ConflictError("La subida de imágenes no está configurada. Pegá la URL https de la imagen.");
  if (!(file instanceof File) || file.size === 0) throw new ValidationError("Elegí una imagen");
  const ext = ALLOWED[file.type];
  if (!ext) throw new ValidationError("Formato no permitido: usá JPG, PNG o WEBP");
  if (file.size > MAX_IMAGE_BYTES) throw new ValidationError("La imagen supera los 2 MB");
  if (!/^[A-Za-z0-9_-]+$/.test(merchantId)) throw new ValidationError("Comercio inválido");

  const { url, key, bucket } = cfg();
  const path = `${merchantId}/${crypto.randomUUID()}.${ext}`;
  let res: Response;
  try {
    res = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: Buffer.from(await file.arrayBuffer()),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch {
    throw new ConflictError("No pudimos subir la imagen. Probá de nuevo.");
  }
  if (!res.ok) throw new ConflictError(`No pudimos subir la imagen (error ${res.status}). Probá de nuevo.`);
  return `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path}`;
}
