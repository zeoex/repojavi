export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-1/2 max-w-sm animate-pulse rounded-lg bg-gray-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="h-28 animate-pulse bg-gray-200" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
