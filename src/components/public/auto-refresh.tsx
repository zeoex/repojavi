"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresca los datos del servidor cada cierto intervalo (solo mientras la pestaña está visible). */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return (
    <p className="text-xs text-gray-500" aria-live="off">
      Esta página se actualiza sola cada {seconds} segundos.
    </p>
  );
}
