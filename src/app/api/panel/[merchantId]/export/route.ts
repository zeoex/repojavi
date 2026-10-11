import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { getActor } from "@/server/authz";
import { exportMerchantOrdersCsv } from "@/server/services/reports";
import { parseDateRange, todayAR } from "@/app/panel/_lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ merchantId: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("No autorizado", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { merchantId } = await params;
  const url = new URL(req.url);
  const range = parseDateRange({ desde: url.searchParams.get("desde") ?? undefined, hasta: url.searchParams.get("hasta") ?? undefined });
  if (range.invalid) return new Response("Rango de fechas inválido", { status: 400, headers: { "Cache-Control": "no-store" } });

  let csv: string;
  try {
    csv = await exportMerchantOrdersCsv(actor, merchantId, { from: range.from, to: range.to });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("No encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });
    throw e;
  }
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { slug: true } });
  const slug = (merchant?.slug ?? "comercio").replace(/[^a-z0-9-]/gi, "");
  const fecha = range.desde || range.hasta ? `${range.desde || "inicio"}_${range.hasta || todayAR()}` : todayAR();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${slug}-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
