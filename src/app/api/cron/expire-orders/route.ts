import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { expireStaleOrders } from "@/server/services/orders";

export const dynamic = "force-dynamic";

/**
 * Vence reservas de stock de pedidos sin pagar. Lo invoca Vercel Cron (vercel.json)
 * con el header Authorization: Bearer ${CRON_SECRET}.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const r = await expireStaleOrders();
  return NextResponse.json({ ok: true, ...r });
}
