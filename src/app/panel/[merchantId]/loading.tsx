export default function PanelLoading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-200" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-gray-200" />
    </div>
  );
}
