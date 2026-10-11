import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor, merchantIdsFor } from "@/server/authz";
import { Badge, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panel de comercio" };

const STATUS_LABEL = { ACTIVE: "Activo", PENDING: "Pendiente", SUSPENDED: "Suspendido" } as const;
const STATUS_TONE = { ACTIVE: "green", PENDING: "amber", SUSPENDED: "red" } as const;

export default async function PanelIndexPage() {
  const actor = await getActor();
  if (!actor) redirect("/ingresar?callbackUrl=/panel");
  const ids = await merchantIdsFor(actor.userId);
  if (ids.length === 1) redirect(`/panel/${ids[0]}`);
  const merchants = ids.length
    ? await prisma.merchant.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, name: true, businessType: true, status: true, salesPaused: true, logoUrl: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <PageTitle title="Panel de comercio" subtitle="Elegí el comercio que querés administrar." />
      {merchants.length === 0 ? (
        <EmptyState
          icon="🏪"
          title="No administrás ningún comercio"
          description="Si tenés un comercio y querés vender en Fedexpress, pedile a la plataforma que te dé de alta con el email de tu cuenta de Google."
          action={<LinkButton href="/" variant="secondary">Volver al inicio</LinkButton>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {merchants.map((m) => (
            <li key={m.id}>
              <Card className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                  {m.logoUrl ? (
                    <img src={m.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-2xl" aria-hidden>
                      🏪
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-gray-900">{m.name}</h2>
                    <p className="text-sm text-gray-600">{m.businessType}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                  {m.salesPaused && <Badge tone="amber">Ventas pausadas</Badge>}
                </div>
                <LinkButton href={`/panel/${m.id}`} className="mt-auto">
                  Administrar
                </LinkButton>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
