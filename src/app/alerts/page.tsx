import { getReadyRepository } from "@/lib/data/ready";
import { OpportunityBadge } from "@/components/ui/OpportunityBadge";
import { dateTime, fullDate, money, pct } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function AlertsPage({ searchParams }: { searchParams: { searchId?: string } }) {
  const repo = await getReadyRepository();
  const alerts = await repo.listAlerts(searchParams.searchId);
  const searches = await repo.listSearches("demo-user");
  const searchNames = new Map(searches.map((s) => [s.id, s.name]));

  const exportHref = searchParams.searchId ? `/api/export/alerts?searchId=${searchParams.searchId}` : "/api/export/alerts";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-base-50">Alertas</h1>
          <p className="text-sm text-base-400">
            {alerts.length} alerta{alerts.length === 1 ? "" : "s"} registrada{alerts.length === 1 ? "" : "s"}
            {searchParams.searchId ? ` para ${searchNames.get(searchParams.searchId) ?? "esta búsqueda"}` : " en total"}.
          </p>
        </div>
        <a href={exportHref} className="btn-secondary text-xs">
          Exportar CSV
        </a>
      </div>

      {alerts.length === 0 ? (
        <div className="card card-pad text-sm text-base-400">
          Todavía no se detectaron oportunidades que cumplan las reglas configuradas.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5 text-xs uppercase tracking-wide text-base-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
                <th className="px-4 py-3 text-left font-medium">Ruta</th>
                <th className="px-4 py-3 text-left font-medium">Búsqueda</th>
                <th className="px-4 py-3 text-right font-medium">Precio</th>
                <th className="px-4 py-3 text-right font-medium">Promedio</th>
                <th className="px-4 py-3 text-right font-medium">Variación</th>
                <th className="px-4 py-3 text-left font-medium">Nivel</th>
                <th className="px-4 py-3 text-left font-medium">Motivo</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-base-400">{dateTime(a.createdAt)}</td>
                  <td className="px-4 py-2.5 text-base-200">
                    {a.origin} → {a.destination}
                  </td>
                  <td className="px-4 py-2.5 text-base-400">{searchNames.get(a.searchId) ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-base-100">{money(a.totalPrice, a.currency)}</td>
                  <td className="px-4 py-2.5 text-right text-base-400">{money(a.averagePrice, a.currency)}</td>
                  <td className={`px-4 py-2.5 text-right ${(a.variationPercent ?? 0) < 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {pct(a.variationPercent)}
                  </td>
                  <td className="px-4 py-2.5">
                    <OpportunityBadge level={a.level} />
                  </td>
                  <td className="px-4 py-2.5 text-base-400">{a.reasonSummary}</td>
                  <td className="px-4 py-2.5 text-base-300">{a.status === "sent" ? "Enviada" : a.status === "pending" ? "Pendiente" : "Duplicada"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
