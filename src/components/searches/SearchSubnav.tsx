"use client";

import Link from "next/link";
import clsx from "clsx";

type Tab = "detail" | "calendar" | "schedule" | "compare";

const TABS: { key: Tab; label: string; path: string }[] = [
  { key: "detail", label: "Resumen", path: "" },
  { key: "calendar", label: "Calendario de precios", path: "/calendar" },
  { key: "schedule", label: "Análisis de horarios", path: "/schedule" },
  { key: "compare", label: "Comparador", path: "/compare" },
];

export function SearchSubnav({ searchId, searchName, active }: { searchId: string; searchName: string; active: Tab }) {
  return (
    <div className="flex flex-col gap-2">
      <Link href={`/searches/${searchId}`} className="text-xs text-base-500 hover:text-base-300">
        ← {searchName}
      </Link>
      <div className="flex gap-1 overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/searches/${searchId}${t.path}`}
            className={clsx(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
              active === t.key ? "bg-accent-500/15 text-accent-400" : "text-base-400 hover:bg-white/5",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
