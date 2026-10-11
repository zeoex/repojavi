export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-3xl space-y-4">
      <span className="sr-only">Cargando entregas…</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
  );
}
