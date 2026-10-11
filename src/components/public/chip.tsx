import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/** Chip de filtro navegable (enlace con estado activo). */
export function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition",
        active ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
      )}
    >
      {children}
    </Link>
  );
}
