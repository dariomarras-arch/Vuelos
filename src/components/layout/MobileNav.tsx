"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/searches", label: "Búsquedas" },
  { href: "/alerts", label: "Alertas" },
  { href: "/api-usage", label: "API" },
  { href: "/logs", label: "Logs" },
  { href: "/settings", label: "Config" },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-white/5 bg-base-950 px-3 py-2 lg:hidden scrollbar-thin">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
              active ? "bg-accent-500/15 text-accent-400" : "text-base-400",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
