"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const LINKS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/comercios", label: "Comercios" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/pagos", label: "Pagos" },
  { href: "/admin/auditoria", label: "Auditoría" },
  { href: "/admin/eventos", label: "Eventos del sistema" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de administración" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {LINKS.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition",
                  active ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-gray-100",
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
