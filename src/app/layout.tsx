import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { MobileNav } from "@/components/layout/MobileNav";

export const metadata: Metadata = {
  title: "Flight Hunter — Monitor de precios de vuelos",
  description: "Agente inteligente de búsqueda y detección de oportunidades de vuelos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-base-950 text-base-100 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <DemoBanner />
            <MobileNav />
            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
