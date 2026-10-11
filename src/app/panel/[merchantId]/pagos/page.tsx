import Link from "next/link";
import type { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatARS } from "@/lib/money";
import { formatDateTimeAR } from "@/lib/time";
import { getPaymentAccountStatus } from "@/server/services/paymentAccounts";
import { mpConfig, oauthConfigured } from "@/server/payments/mercadopago";
import { connectManualCredentialsAction, disconnectMercadoPagoAction } from "@/app/actions/merchant";
import { ActionButton } from "@/components/forms";
import { Alert, Badge, Card, PageTitle, SimulatedBadge, Table, Td } from "@/components/ui";
import { requireMerchantPage } from "../../_lib/guard";
import { FieldsForm } from "../../_components/fields-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pagos" };

const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: "gray" | "amber" | "green" | "red" | "blue" }> = {
  PENDING: { label: "Pendiente", tone: "amber" },
  IN_PROCESS: { label: "En proceso", tone: "amber" },
  APPROVED: { label: "Aprobado", tone: "green" },
  REJECTED: { label: "Rechazado", tone: "red" },
  CANCELLED: { label: "Cancelado", tone: "gray" },
  REFUNDED: { label: "Reembolsado", tone: "gray" },
  PARTIALLY_REFUNDED: { label: "Reembolso parcial", tone: "blue" },
  CHARGED_BACK: { label: "Contracargo", tone: "red" },
};

const ACCOUNT_STATUS = {
  CONNECTED: { label: "Conectada", tone: "green" },
  EXPIRED: { label: "Vencida", tone: "red" },
  REVOKED: { label: "Revocada", tone: "red" },
  ERROR: { label: "Con error", tone: "amber" },
} as const;

export default async function PaymentsPage({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  await requireMerchantPage(merchantId, "/pagos");
  const [account, payments] = await Promise.all([
    getPaymentAccountStatus(merchantId),
    prisma.payment.findMany({
      where: { merchantId },
      include: { order: { select: { id: true, number: true } }, refunds: { select: { id: true, amount: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const oauth = oauthConfigured();
  const manual = mpConfig().allowManualCredentials;
  const connectHref = `/api/mercadopago/oauth/start?merchant=${encodeURIComponent(merchantId)}`;

  return (
    <div className="space-y-6">
      <PageTitle title="Pagos" subtitle="Tus clientes te pagan directamente en tu cuenta de Mercado Pago." />

      <Card className="space-y-4 p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Cuenta de Mercado Pago</h2>
        {account ? (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Estado</dt>
                <dd>
                  <Badge tone={ACCOUNT_STATUS[account.status].tone}>{ACCOUNT_STATUS[account.status].label}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Usuario de Mercado Pago</dt>
                <dd className="font-mono">{account.providerUserId}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Modo</dt>
                <dd>{account.liveMode ? <Badge tone="green">Producción (cobros reales)</Badge> : <Badge tone="amber">Prueba (sandbox)</Badge>}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Conectada el</dt>
                <dd>{formatDateTimeAR(account.connectedAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Vencimiento del permiso</dt>
                <dd>{account.expiresAt ? formatDateTimeAR(account.expiresAt) : "Sin vencimiento informado"}</dd>
              </div>
            </dl>
            {account.lastError && <Alert tone="error">Último error: {account.lastError}</Alert>}
            {account.status !== "CONNECTED" && (
              <Alert tone="warning">La conexión no está activa: tus clientes no pueden pagar. Volvé a conectar tu cuenta.</Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {account.status !== "CONNECTED" && oauth && (
                <a href={connectHref} className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                  Reconectar Mercado Pago
                </a>
              )}
              <ActionButton
                action={disconnectMercadoPagoAction.bind(null, merchantId)}
                variant="danger"
                pendingText="Desconectando…"
                confirm="¿Desconectar Mercado Pago? Mientras no vuelvas a conectar tu cuenta, tus clientes no van a poder pagar pedidos. Los reembolsos pendientes tampoco se van a poder procesar."
              >
                Desconectar
              </ActionButton>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              Conectá tu cuenta para cobrar. El dinero de cada venta se acredita en tu cuenta de Mercado Pago; Fedexpress nunca ve ni guarda datos de tarjetas.
            </p>
            {oauth ? (
              <a href={connectHref} className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Conectar Mercado Pago
              </a>
            ) : (
              <Alert tone="warning">
                La conexión con Mercado Pago todavía no está disponible: la plataforma tiene que configurar su aplicación de Mercado Pago (variables MP_CLIENT_ID y
                MP_CLIENT_SECRET). Avisale al equipo de Fedexpress.
              </Alert>
            )}
          </>
        )}
      </Card>

      {manual && (
        <Card className="space-y-4 p-4 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Cargar credenciales de prueba (sandbox)</h2>
            <p className="text-sm text-gray-600">
              Solo para pruebas: pegá el Access Token de un usuario de prueba vendedor de Mercado Pago. Se guarda cifrado y nunca se vuelve a mostrar.
            </p>
          </div>
          <FieldsForm
            action={connectManualCredentialsAction.bind(null, merchantId)}
            idPrefix="mp"
            resetOnSuccess
            submitLabel="Conectar con estas credenciales"
            pendingText="Verificando…"
            fields={[
              { name: "accessToken", label: "Access Token", type: "password", required: true, autoComplete: "off", placeholder: "TEST-…" },
              { name: "publicKey", label: "Public Key (opcional)", autoComplete: "off", placeholder: "TEST-…" },
            ]}
          />
        </Card>
      )}

      <section className="space-y-3" aria-labelledby="historial">
        <h2 id="historial" className="text-lg font-semibold">Historial de pagos</h2>
        <p className="text-sm text-gray-600">Últimos 200 pagos recibidos.</p>
        <Table
          head={["Pedido", "Fecha", "Proveedor", "Id de pago", "Estado", "Monto", "Reembolsos"]}
          empty={payments.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">Todavía no recibiste pagos.</p> : undefined}
        >
          {payments.map((p) => (
            <tr key={p.id}>
              <Td>
                <Link href={`/panel/${merchantId}/pedidos/${p.order.id}`} className="font-semibold text-brand-700 hover:underline">
                  #{p.order.number}
                </Link>
              </Td>
              <Td>{formatDateTimeAR(p.createdAt)}</Td>
              <Td>
                <span className="flex items-center gap-2">
                  {p.provider === "MERCADOPAGO" ? "Mercado Pago" : "Demo"}
                  {p.isSimulated && <SimulatedBadge />}
                </span>
              </Td>
              <Td className="font-mono text-xs">{p.providerPaymentId ?? "—"}</Td>
              <Td>
                <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
              </Td>
              <Td>{formatARS(p.amount)}</Td>
              <Td className="whitespace-normal">
                {p.refunds.length === 0
                  ? "—"
                  : p.refunds.map((r) => (
                      <span key={r.id} className="block text-xs">
                        {formatARS(r.amount)} · {r.status === "APPROVED" ? "Aprobado" : r.status === "PENDING" ? "Pendiente" : "Rechazado"}
                      </span>
                    ))}
              </Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
