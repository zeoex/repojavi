import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPaymentAccountStatus } from "@/server/services/paymentAccounts";
import { setSalesPausedAction } from "@/app/actions/merchant";
import { ActionButton } from "@/components/forms";
import { Alert, Badge } from "@/components/ui";
import { requireMerchantPage } from "../_lib/guard";
import { PanelNav } from "./panel-nav";

export const dynamic = "force-dynamic";

const STATUS_LABEL = { ACTIVE: "Activo", PENDING: "Pendiente de aprobación", SUSPENDED: "Suspendido" } as const;
const STATUS_TONE = { ACTIVE: "green", PENDING: "amber", SUSPENDED: "red" } as const;

export default async function MerchantPanelLayout({ children, params }: { children: ReactNode; params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  await requireMerchantPage(merchantId);
  const merchant = await prisma.merchant.findFirst({
    where: { id: merchantId, deletedAt: null },
    select: { id: true, name: true, slug: true, status: true, salesPaused: true },
  });
  if (!merchant) notFound();
  const mp = await getPaymentAccountStatus(merchantId);
  const mpOk = mp?.status === "CONNECTED";

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-60 lg:shrink-0">
        <div className="mb-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Panel de comercio</p>
          <p className="text-lg font-bold leading-tight text-gray-900">{merchant.name}</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_TONE[merchant.status]}>{STATUS_LABEL[merchant.status]}</Badge>
            {merchant.salesPaused && <Badge tone="amber">Ventas pausadas</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <ActionButton
              action={setSalesPausedAction.bind(null, merchantId, !merchant.salesPaused)}
              variant={merchant.salesPaused ? "primary" : "danger"}
              pendingText={merchant.salesPaused ? "Reanudando…" : "Pausando…"}
              confirm={merchant.salesPaused ? undefined : "¿Pausar las ventas? Los clientes no van a poder hacer pedidos nuevos hasta que las reanudes."}
            >
              {merchant.salesPaused ? "Reanudar ventas" : "Pausar ventas"}
            </ActionButton>
            {merchant.status === "ACTIVE" && (
              <Link href={`/comercios/${merchant.slug}`} className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
                Ver tienda
              </Link>
            )}
          </div>
        </div>
        <PanelNav merchantId={merchantId} />
      </aside>
      <div className="min-w-0 flex-1 space-y-4">
        {merchant.status !== "ACTIVE" && (
          <Alert tone="warning">
            {merchant.status === "PENDING"
              ? "Tu comercio está pendiente de aprobación: todavía no aparece en el portal. Podés ir cargando productos y configuración."
              : "Tu comercio está suspendido por la plataforma y no aparece en el portal. Contactá a soporte."}
          </Alert>
        )}
        {!mpOk && (
          <Alert tone="warning">
            {mp ? "La conexión con Mercado Pago no está activa" : "Todavía no conectaste Mercado Pago"}: tus clientes no pueden pagar pedidos.{" "}
            <Link href={`/panel/${merchantId}/pagos`} className="font-semibold underline">
              Conectar Mercado Pago
            </Link>
          </Alert>
        )}
        {children}
      </div>
    </div>
  );
}
