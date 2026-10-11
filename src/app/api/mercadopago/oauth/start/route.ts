import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/authz";
import { startMercadoPagoConnect } from "@/server/services/paymentAccounts";
import { toPublicMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Inicia la vinculación OAuth de la cuenta de Mercado Pago del comercio. */
export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get("merchant") ?? "";
  const actor = await getActor();
  if (!actor) return NextResponse.redirect(new URL(`/ingresar?callbackUrl=/panel/${encodeURIComponent(merchantId)}/pagos`, req.url));
  try {
    const { url, nonce } = await startMercadoPagoConnect(actor, merchantId);
    const res = NextResponse.redirect(url);
    res.cookies.set("mp_oauth_nonce", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/mercadopago/oauth", maxAge: 600 });
    return res;
  } catch (e) {
    const u = new URL(`/panel/${encodeURIComponent(merchantId)}/pagos`, req.url);
    u.searchParams.set("error", toPublicMessage(e));
    return NextResponse.redirect(u);
  }
}
