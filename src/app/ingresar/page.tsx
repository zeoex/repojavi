import { redirect } from "next/navigation";
import { getActor } from "@/server/authz";
import { devLoginEnabled } from "@/server/auth/options";
import { Alert, Card } from "@/components/ui";
import { Logo } from "@/components/logo";
import { SignInButtons } from "./sign-in-buttons";

export const metadata = { title: "Ingresar" };

const ERRORS: Record<string, string> = {
  suspended: "Tu cuenta está suspendida. Si creés que es un error, contactá a soporte.",
  AccessDenied: "No pudimos validar tu cuenta de Google (el email debe estar verificado).",
  OAuthAccountNotLinked: "Ese email ya está asociado a otra forma de ingreso.",
  CredentialsSignin: "No pudimos iniciar sesión con ese email.",
  Configuration: "El inicio de sesión no está configurado correctamente en el servidor.",
};

function safeCallback(raw: string | undefined) {
  // Solo rutas internas: evita redirecciones abiertas
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const sp = await searchParams;
  const callbackUrl = safeCallback(sp.callbackUrl);
  if (await getActor()) redirect(callbackUrl);
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const dev = devLoginEnabled();
  return (
    <div className="mx-auto max-w-md py-8">
      <Card className="space-y-6 p-6 sm:p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo />
          <h1 className="text-xl font-bold">Ingresá para comprar</h1>
          <p className="text-sm text-gray-600">Podés recorrer los comercios sin cuenta. Para comprar necesitás ingresar con Google.</p>
        </div>
        {sp.error && <Alert tone="error">{ERRORS[sp.error] ?? "No pudimos iniciar sesión. Probá de nuevo."}</Alert>}
        {!googleEnabled && !dev && (
          <Alert tone="warning">El ingreso con Google todavía no está configurado (faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).</Alert>
        )}
        <SignInButtons callbackUrl={callbackUrl} google={googleEnabled} dev={dev} />
        <p className="text-center text-xs text-gray-500">Al ingresar se crea tu cuenta de cliente. Nunca te pediremos datos de tarjeta: los pagos se hacen en Mercado Pago.</p>
      </Card>
    </div>
  );
}
