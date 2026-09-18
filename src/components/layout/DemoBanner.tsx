import { isDemoMode } from "@/lib/data";
import { getActiveProvider } from "@/lib/providers";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  const provider = getActiveProvider();

  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-300">
      <span>⚠ MODO DEMO — DATOS SIMULADOS</span>
      <span className="hidden text-amber-400/70 sm:inline">
        · Proveedor activo: {provider.label} · Persistencia en memoria (Supabase no configurado)
      </span>
    </div>
  );
}
