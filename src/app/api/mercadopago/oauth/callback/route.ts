import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/authz";
import { completeMercadoPagoConnect, verifyOAuthState } from "@/server/services/paymentAccounts";
import { toPublicMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Callback OAuth: valida state firmado + nonce en cookie, intercambia el code y guarda los tokens cifrados. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const state = sp.get("state") ?? "";
  const code = sp.get("code");
  const merchantHint = verifyOAuthState(state)?.merchantId;
  const back = (msg: string, ok = false) => {
    const u = new URL(merchantHint ? `/panel/${merchantHint}/pagos` : "/panel", req.url);
    u.searchParams.set(ok ? "ok" : "error", msg);
    const res = NextResponse.redirect(u);
    res.cookies.delete({ name: "mp_oauth_nonce", path: "/api/mercadopago/oauth" });
    return res;
  };
  const actor = await getActor();
  if (!actor) return NextResponse.redirect(new URL("/ingresar", req.url));
  if (!code) return back(sp.get("error") ? "Cancelaste la autorización en Mercado Pago." : "Respuesta inválida de Mercado Pago.");
  try {
    await completeMercadoPagoConnect(actor, state, code, req.cookies.get("mp_oauth_nonce")?.value);
    return back("Cuenta de Mercado Pago conectada.", true);
  } catch (e) {
    return back(toPublicMessage(e));
  }
}
