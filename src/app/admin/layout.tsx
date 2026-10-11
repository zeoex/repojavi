import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/server/authz";
import { isSuperadmin } from "@/server/actor";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Administración", template: "%s · Administración · Fedexpress" } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/ingresar?callbackUrl=/admin");
  // No se revela la existencia del panel a quien no es superadmin.
  if (!isSuperadmin(actor)) notFound();
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <p className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-gray-500 lg:block">Administración</p>
        <AdminNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
