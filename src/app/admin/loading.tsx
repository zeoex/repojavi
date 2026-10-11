export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-gray-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  );
}
