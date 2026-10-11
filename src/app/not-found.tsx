import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        icon="🧭"
        title="No encontramos esta página"
        description="Puede que el enlace esté mal escrito, o que el comercio o el pedido ya no estén disponibles."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton href="/">Ir al inicio</LinkButton>
            <LinkButton href="/buscar" variant="secondary">
              Buscar comercios
            </LinkButton>
          </div>
        }
      />
    </div>
  );
}
