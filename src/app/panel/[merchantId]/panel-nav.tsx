"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "", label: "Resumen" },
  { href: "/pedidos", label: "Pedidos" },
  { href: "/productos", label: "Productos" },
  { href: "/inventario", label: "Inventario" },
  { href: "/categorias", label: "Categorías" },
  { href: "/repartidores", label: "Repartidores" },
  { href: "/pagos", label: "Pagos" },
  { href: "/reportes", label: "Reportes" },
  { href: "/configuracion", label: "Configuración" },
];

export function PanelNav({ merchantId }: { merchantId: string }) {
  const pathname = usePathname();
  const base = `/panel/${merchantId}`;
  return (
    <nav aria-label="Secciones del panel" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 whitespace-nowrap border-b border-gray-200 pb-2 lg:flex-col lg:border-b-0 lg:pb-0">
        {TABS.map((t) => {
          const href = base + t.href;
          const active = t.href === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={t.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block rounded-xl px-3 py-2 text-sm font-medium transition",
                  active ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-gray-100",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
