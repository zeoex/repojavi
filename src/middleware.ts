import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Primera barrera: las rutas privadas exigen sesión. La autorización real (rol, comercio,
 * propiedad del recurso) se verifica SIEMPRE en el servidor en cada página/acción/servicio.
 */
const PRIVATE = ["/carrito", "/checkout", "/pedidos", "/cuenta", "/panel", "/admin", "/repartidor"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.uid) {
    const url = req.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/carrito/:path*", "/checkout/:path*", "/pedidos/:path*", "/cuenta/:path*", "/panel/:path*", "/admin/:path*", "/repartidor/:path*"],
};
