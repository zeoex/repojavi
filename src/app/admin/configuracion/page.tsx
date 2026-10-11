import { getPlatformSettings } from "@/server/services/platform";
import { mpConfig, oauthConfigured } from "@/server/payments/mercadopago";
import { demoPaymentsEnabled } from "@/server/services/payments";
import { Alert, Badge, Card, PageTitle } from "@/components/ui";
import { requireAdminPage } from "../_auth";
import { PlatformSettingsForm } from "./settings-form";

export const metadata = { title: "Configuración" };

type Check = { label: string; ok: boolean; hint: string; okText?: string; failText?: string; failTone?: "red" | "amber" | "gray" };

export default async function AdminSettingsPage() {
  await requireAdminPage("/admin/configuracion");
  const settings = await getPlatformSettings();
  const env = process.env;
  const mp = mpConfig();
  const isProd = env.NODE_ENV === "production";
  const demo = demoPaymentsEnabled();
  const appUrlSet = Boolean(env.APP_URL);
  const appUrlHttps = appUrlSet && env.APP_URL!.startsWith("https://");

  // Solo booleanos: nunca se muestran valores de variables de entorno.
  const checks: Check[] = [
    { label: "Inicio de sesión con Google", ok: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), hint: "GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET" },
    { label: "Aplicación de Mercado Pago (OAuth)", ok: oauthConfigured(), hint: "MP_CLIENT_ID y MP_CLIENT_SECRET" },
    { label: "Secreto de webhooks de Mercado Pago", ok: Boolean(mp.webhookSecret), hint: "MP_WEBHOOK_SECRET" },
    {
      label: "Firma de webhooks obligatoria",
      ok: mp.requireSignature,
      hint: "MP_WEBHOOK_REQUIRE_SIGNATURE=true",
      okText: "Sí",
      failText: "No",
      failTone: isProd ? "red" : "amber",
    },
    { label: "Clave de cifrado de tokens", ok: Boolean(env.ENCRYPTION_KEY), hint: "ENCRYPTION_KEY" },
    {
      label: "Almacenamiento de imágenes",
      ok: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_STORAGE_BUCKET),
      hint: "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_STORAGE_BUCKET",
      failTone: "amber",
    },
    { label: "Secreto de tareas programadas", ok: Boolean(env.CRON_SECRET), hint: "CRON_SECRET" },
    {
      label: "URL pública de la app",
      ok: appUrlSet && (!isProd || appUrlHttps),
      hint: isProd ? "APP_URL (debe usar https en producción)" : "APP_URL",
      failTone: isProd ? "red" : "amber",
    },
  ];

  return (
    <div className="space-y-8">
      <PageTitle title="Configuración" subtitle="Estado de las integraciones y parámetros de la plataforma." />

      {demo && isProd && (
        <Alert tone="error">
          <strong>Atención:</strong> los pagos simulados (DEMO_PAYMENTS_ENABLED) están habilitados en producción. Cualquier cliente podría &quot;pagar&quot; sin mover dinero real. Deshabilitalos cuanto antes.
        </Alert>
      )}

      <section aria-labelledby="sec-integraciones" className="space-y-3">
        <h2 id="sec-integraciones" className="text-lg font-semibold text-gray-900">Integraciones</h2>
        <p className="text-sm text-gray-600">Por seguridad solo se indica si cada variable está configurada; los valores nunca se muestran. Se cambian en las variables de entorno del servidor.</p>
        <Card>
          <ul className="divide-y divide-gray-100">
            {checks.map((c) => (
              <li key={c.label} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-900">{c.label}</p>
                  <p className="font-mono text-xs text-gray-500">{c.hint}</p>
                </div>
                {c.ok ? <Badge tone="green">✓ {c.okText ?? "Configurado"}</Badge> : <Badge tone={c.failTone ?? "red"}>✗ {c.failText ?? "No configurado"}</Badge>}
              </li>
            ))}
            <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-gray-900">Pagos simulados (demo)</p>
                <p className="font-mono text-xs text-gray-500">DEMO_PAYMENTS_ENABLED</p>
              </div>
              {demo ? <Badge tone={isProd ? "red" : "amber"}>Habilitados{isProd ? " en producción" : ""}</Badge> : <Badge tone="green">Deshabilitados</Badge>}
            </li>
            <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-gray-900">Entorno</p>
                <p className="font-mono text-xs text-gray-500">NODE_ENV</p>
              </div>
              <Badge tone={isProd ? "violet" : "gray"}>{isProd ? "Producción" : "Desarrollo / pruebas"}</Badge>
            </li>
          </ul>
        </Card>
      </section>

      <section aria-labelledby="sec-parametros" className="space-y-3">
        <h2 id="sec-parametros" className="text-lg font-semibold text-gray-900">Parámetros de la plataforma</h2>
        <Card className="p-4 sm:p-6">
          <PlatformSettingsForm announcement={settings.announcement} supportEmail={settings.supportEmail} />
        </Card>
      </section>
    </div>
  );
}
