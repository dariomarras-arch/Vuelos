import Link from "next/link";
import { DEMO_USER_ID } from "@/lib/constants";
import { getReadyRepository } from "@/lib/data/ready";
import { StatusPill } from "@/components/ui/StatusPill";
import { hoursSince, money } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function SearchesPage() {
  const repo = await getReadyRepository();
  const searches = await repo.listSearches(DEMO_USER_ID);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-base-50">Búsquedas</h1>
          <p className="text-sm text-base-400">Configurá qué rutas monitorea el agente y con qué criterios.</p>
        </div>
        <Link href="/searches/new" className="btn-primary">
          + Crear búsqueda
        </Link>
      </div>

      {searches.length === 0 ? (
        <div className="card card-pad text-center text-sm text-base-400">Todavía no hay búsquedas configuradas.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/5 text-xs uppercase tracking-wide text-base-500">
              <tr>
                <th className="px-4 py-3 font-medium">Búsqueda</th>
                <th className="px-4 py-3 font-medium">Ruta</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Objetivo</th>
                <th className="px-4 py-3 font-medium">Última ejecución</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {searches.map((s) => (
                <tr key={s.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-base-100">{s.name}</td>
                  <td className="px-4 py-3 text-base-300">
                    {s.origins.join("/")} → {s.destinations.join("/")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-base-300">{money(s.targetPrice, s.currency)}</td>
                  <td className="px-4 py-3 text-base-400">{hoursSince(s.lastRunAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/searches/${s.id}`} className="text-xs font-medium text-accent-400 hover:text-accent-300">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
