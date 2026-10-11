import { Button, Input, LinkButton } from "@/components/ui";

/** Filtro de fechas por GET (?desde=&hasta=). */
export function DateFilter({ action, desde, hasta, invalid }: { action: string; desde: string; hasta: string; invalid?: boolean }) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3" aria-label="Filtrar por fecha">
      <div className="space-y-1">
        <label htmlFor="desde" className="block text-sm font-medium text-gray-700">
          Desde
        </label>
        <Input id="desde" type="date" name="desde" defaultValue={desde} className="w-auto" />
      </div>
      <div className="space-y-1">
        <label htmlFor="hasta" className="block text-sm font-medium text-gray-700">
          Hasta
        </label>
        <Input id="hasta" type="date" name="hasta" defaultValue={hasta} className="w-auto" />
      </div>
      <Button type="submit" variant="secondary">
        Filtrar
      </Button>
      {(desde || hasta) && (
        <LinkButton href={action} variant="ghost">
          Limpiar
        </LinkButton>
      )}
      {invalid && <p className="w-full text-xs font-medium text-red-600">La fecha “desde” es posterior a “hasta”.</p>}
    </form>
  );
}
