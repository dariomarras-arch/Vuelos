"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◱" },
  { href: "/searches", label: "Búsquedas", icon: "🔍" },
  { href: "/alerts", label: "Alertas", icon: "🔔" },
  { href: "/api-usage", label: "Uso de API", icon: "📊" },
  { href: "/logs", label: "Historial de ejecuciones", icon: "📜" },
  { href: "/settings", label: "Configuración", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-white/5 bg-base-950 px-3 py-4 lg:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="text-xl">✈️</span>
        <div>
          <div className="text-sm font-bold tracking-wide text-base-50">FLIGHT HUNTER</div>
          <div className="text-[10px] uppercase tracking-widest text-base-500">Flight opportunity engine</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-accent-500/10 text-accent-400" : "text-base-400 hover:bg-white/5 hover:text-base-100",
              )}
            >
              <span className="w-4 text-center text-base leading-none opacity-80">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-white/5 bg-base-900 px-3 py-2.5 text-[11px] leading-relaxed text-base-500">
        Arquitectura lista para conectar una API de vuelos real. Ver <span className="text-base-300">Configuración</span>.
      </div>
    </aside>
  );
}
