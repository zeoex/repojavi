import { getPlatformSettings } from "@/server/services/platform";

/** Banner fino con el anuncio de la plataforma (configurable desde /admin/configuracion). */
export async function Announcement() {
  const { announcement } = await getPlatformSettings();
  if (!announcement) return null;
  return (
    <div role="region" aria-label="Anuncio de la plataforma" className="bg-brand-700 px-4 py-2 text-center text-sm font-medium text-white">
      {announcement}
    </div>
  );
}
