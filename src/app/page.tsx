import Link from "next/link";
import { getDashboardData } from "@/lib/view/dashboard";
import { SearchSummaryCard } from "@/components/dashboard/SearchSummaryCard";
import { OpportunityCard } from "@/components/dashboard/OpportunityCard";
import { MetricCard } from "@/components/ui/MetricCard";
import { PriceHistoryChart } from "@/components/charts/PriceHistoryChart";
import { BestDatesChart } from "@/components/charts/BestDatesChart";
import { TimeSlotChart } from "@/components/charts/TimeSlotChart";
import { hoursSince, money, pct } from "@/lib/utils/format";
import { referenceUnitPrice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const bestOpportunity = data.topOpportunities[0] ?? null;
  const currency = data.primarySearch?.currency ?? "USD";
  // All the metric cards below compare on the per-adult reference price —
  // the same unit as targetPrice/maxPrice and the historical stats — never
  // the party total (see referenceUnitPrice in types.ts).
  const bestReferencePrice = bestOpportunity ? referenceUnitPrice(bestOpportunity.flightResult) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-base-50">Dashboard</h1>
        <p className="text-sm text-base-400">
          Vista general de tus búsquedas activas y las oportunidades detectadas por el motor de análisis.
        </p>
      </div>

      {data.searches.length === 0 ? (
        <div className="card card-pad text-center">
          <p className="mb-3 text-sm text-base-400">Todavía no configuraste ninguna búsqueda.</p>
          <Link href="/searches/new" className="btn-primary inline-flex">
            Crear búsqueda
          </Link>
        </div>
      ) : (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Mis búsquedas</h2>
              <Link href="/searches/new" className="text-xs font-medium text-accent-400 hover:text-accent-300">
                + Nueva búsqueda
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.searches.map((s) => (
                <SearchSummaryCard key={s.id} search={s} />
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Precio actual" value={bestReferencePrice !== null ? money(bestReferencePrice, currency) : "—"} />
            <MetricCard label="Precio objetivo" value={data.primarySearch ? money(data.primarySearch.targetPrice, currency) : "—"} />
            <MetricCard label="Promedio" value={money(data.stats?.average ?? null, currency)} />
            <MetricCard label="Mínimo histórico" value={money(data.stats?.min ?? null, currency)} />
            <MetricCard
              label="Ahorro potencial"
              value={
                bestReferencePrice !== null && data.stats?.average
                  ? money(Math.max(0, data.stats.average - bestReferencePrice), currency)
                  : "—"
              }
              accent="up"
            />
            <MetricCard label="Última búsqueda" value={hoursSince(data.primarySearch?.lastRunAt ?? null)} />
          </section>

          <section>
            <h2 className="mb-3 section-title">Mejores oportunidades</h2>
            {data.topOpportunities.length === 0 ? (
              <div className="card card-pad text-sm text-base-400">
                Ninguna oportunidad destacada todavía. El motor todavía está construyendo histórico o los precios están dentro del rango normal.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.topOpportunities.map((c) => (
                  <OpportunityCard key={c.flightResult.id} combo={c} />
                ))}
              </div>
            )}
          </section>

          {data.primarySearch && (
            <>
              <section className="card card-pad">
                <div className="mb-1 flex items-baseline justify-between">
                  <h2 className="section-title">Evolución de precios</h2>
                  {data.primaryRoute && (
                    <span className="text-xs text-base-500">
                      {data.primaryRoute.origin} → {data.primaryRoute.destination} · {data.primarySearch.name}
                    </span>
                  )}
                </div>
                <PriceHistoryChart data={data.priceHistory} currency={currency} />
              </section>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="card card-pad">
                  <h2 className="mb-1 section-title">Mejores fechas</h2>
                  <p className="mb-2 text-xs text-base-500">Precio de salida por fecha, dentro del rango configurado.</p>
                  <BestDatesChart data={data.bestDates.map((d) => ({ date: d.date, price: d.price ?? 0 }))} currency={currency} />
                </section>

                <section className="card card-pad">
                  <h2 className="mb-1 section-title">Mejores horarios</h2>
                  <p className="mb-2 text-xs text-base-500">Precio promedio observado por franja horaria de salida.</p>
                  <TimeSlotChart data={data.timeSlots} currency={currency} />
                </section>
              </div>

              <section className="card card-pad flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-base-100">Alertas</div>
                  <div className="text-xs text-base-500">
                    {data.totals.opportunitiesDetected} oportunidades detectadas · {data.totals.alertsSent} alertas enviadas
                  </div>
                </div>
                <Link href="/alerts" className="btn-secondary text-xs">
                  Ver historial de alertas
                </Link>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
