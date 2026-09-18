import Link from "next/link";
import { getApiUsageData } from "@/lib/view/apiUsage";
import { MetricCard } from "@/components/ui/MetricCard";

export const dynamic = "force-dynamic";

export default async function ApiUsagePage({ searchParams }: { searchParams: { searchId?: string } }) {
  const data = await getApiUsageData(searchParams.searchId);
  const { searches, selectedSearch, summary, recentRuns } = data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-base-50">Uso de API</h1>
        <p className="text-sm text-base-400">
          Consumo de requests contra el proveedor de vuelos, efecto del cache y errores recientes — por búsqueda.
        </p>
      </div>

      {searches.length === 0 || !selectedSearch ? (
        <div className="card card-pad text-sm text-base-400">Creá una búsqueda primero.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {searches.map((s) => (
              <Link
                key={s.id}
                href={`/api-usage?searchId=${s.id}`}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  s.id === selectedSearch.id ? "bg-accent-500/15 text-accent-400" : "bg-base-850 text-base-400 border border-white/10"
                }`}
              >
                {s.name}
              </Link>
            ))}
          </div>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Requests hoy" value={`${summary.requestsToday} / ${summary.limitToday}`} />
            <MetricCard label="Requests última corrida" value={`${summary.requestsLastRun} / ${summary.limitPerRun}`} />
            <MetricCard label="Errores (hoy)" value={summary.errors} accent={summary.errors > 0 ? "down" : "neutral"} />
            <MetricCard label="Rate limits (hoy)" value={summary.rateLimited} accent={summary.rateLimited > 0 ? "down" : "neutral"} />
            <MetricCard label="Cache hits (hoy)" value={summary.cacheHits} accent="up" />
            <MetricCard label="Cache misses (hoy)" value={summary.cacheMisses} />
          </section>

          <section className="card card-pad">
            <div className="text-sm font-medium text-base-100">Ahorro estimado por cache</div>
            <div className="mt-1 text-2xl font-bold text-emerald-400">{summary.cacheHits} requests</div>
            <p className="mt-1 text-xs text-base-500">
              Consultas que se resolvieron desde el cache en vez de generar un request nuevo al proveedor, dentro del TTL
              configurado ({selectedSearch.cacheTtlHours}h para esta búsqueda).
            </p>
          </section>

          <section className="card card-pad">
            <h2 className="mb-3 section-title">Últimas corridas</h2>
            {recentRuns.length === 0 ? (
              <p className="text-sm text-base-500">Sin corridas todavía.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-base-500">
                  <tr>
                    <th className="py-1.5 text-left font-medium">Corrida</th>
                    <th className="py-1.5 text-right font-medium">Requests</th>
                    <th className="py-1.5 text-right font-medium">Cache hits</th>
                    <th className="py-1.5 text-right font-medium">Presupuesto agotado</th>
                    <th className="py-1.5 text-right font-medium">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="py-1.5 text-base-300">{new Date(r.startedAt).toLocaleString("es-AR")}</td>
                      <td className="py-1.5 text-right text-base-200">{r.requestsUsed}</td>
                      <td className="py-1.5 text-right text-base-200">{r.cacheHits}</td>
                      <td className="py-1.5 text-right text-base-200">{r.budgetExhausted ? "Sí" : "No"}</td>
                      <td className="py-1.5 text-right text-base-200">
                        {Object.values(r.errorsByCode).reduce((a, b) => a + (b ?? 0), 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
