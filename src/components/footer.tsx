import Link from "next/link";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm text-gray-600 sm:grid-cols-3 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <Logo />
          <p>Los comercios de tu barrio, en un solo lugar. Cada comercio vende, cobra y entrega por su cuenta.</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-gray-900">Comprar</p>
          <Link href="/" className="block hover:text-brand-700">Comercios</Link>
          <Link href="/buscar" className="block hover:text-brand-700">Buscar productos</Link>
          <Link href="/pedidos" className="block hover:text-brand-700">Mis pedidos</Link>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-gray-900">Pagos</p>
          <p>Pagás con Mercado Pago directamente al comercio. Fedexpress no guarda datos de tarjetas.</p>
          <p className="text-xs text-gray-400">Precios en pesos argentinos (ARS), con IVA incluido según informe cada comercio.</p>
        </div>
      </div>
    </footer>
  );
}
