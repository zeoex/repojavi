"use client";

import { Alert, Button } from "@/components/ui";

export default function CourierError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Alert tone="error">No pudimos cargar tus entregas. Revisá tu conexión y probá de nuevo.</Alert>
      <Button variant="secondary" onClick={() => reset()}>
        Reintentar
      </Button>
    </div>
  );
}
