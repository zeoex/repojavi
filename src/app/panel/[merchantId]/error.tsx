"use client";

import { Alert, Button } from "@/components/ui";

export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4">
      <Alert tone="error">No pudimos cargar esta sección del panel. Probá de nuevo en unos segundos.</Alert>
      <Button variant="secondary" onClick={() => reset()}>
        Reintentar
      </Button>
    </div>
  );
}
