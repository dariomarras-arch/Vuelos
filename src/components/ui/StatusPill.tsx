import clsx from "clsx";
import { SearchStatus } from "@/lib/types";

const CONFIG: Record<SearchStatus, { label: string; dot: string; text: string }> = {
  active: { label: "Activa", dot: "bg-emerald-400", text: "text-emerald-300" },
  paused: { label: "Pausada", dot: "bg-amber-400", text: "text-amber-300" },
  error: { label: "Error de conexión", dot: "bg-red-400", text: "text-red-300" },
};

export function StatusPill({ status, className }: { status: SearchStatus; className?: string }) {
  const c = CONFIG[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium", c.text, className)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}
