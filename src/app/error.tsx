"use client";

import Link from "next/link";
import { Button } from "@/components/ui";

// Nunca mostramos detalles técnicos del error al usuario.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-gray-200 bg-white px-6 py-14 text-center shadow-sm" role="alert">
      <div className="mb-3 text-4xl" aria-hidden>
        😕
      </div>
      <h1 className="text-lg font-semibold text-gray-900">Algo salió mal</h1>
      <p className="mt-1 max-w-md text-sm text-gray-600">Tuvimos un problema al cargar esta página. Probá de nuevo en unos segundos; si sigue pasando, volvé al inicio.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => reset()}>
          Reintentar
        </Button>
        <Link href="/" className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
