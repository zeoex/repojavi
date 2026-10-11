import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Announcement } from "@/components/announcement";

export const metadata: Metadata = {
  title: { default: "Fedexpress — Comprá en los comercios de tu barrio", template: "%s · Fedexpress" },
  description: "Marketplace de comercios locales con delivery. Pedí al almacén, súper o farmacia de tu zona y pagá con Mercado Pago.",
};

export const viewport: Viewport = { themeColor: "#5a34f0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="flex min-h-screen flex-col">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
          Saltar al contenido
        </a>
        <Announcement />
        <Header />
        <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
