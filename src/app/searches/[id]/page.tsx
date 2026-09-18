import Link from "next/link";
import { notFound } from "next/navigation";
import { getSearchDetail } from "@/lib/view/searchDetail";
import { StatusPill } from "@/components/ui/StatusPill";
import { OpportunityBadge } from "@/components/ui/OpportunityBadge";
import { MetricCard } from "@/components/ui/MetricCard";
import { PriceHistoryChart } from "@/components/charts/PriceHistoryChart";
import { RunNowButton } from "@/components/searches/RunNowButton";
import { SearchSubnav } from "@/components/searches/SearchSubnav";
import { dateTime, fullDate, hoursSince, money, pct } from "@/lib/utils/format";
import { isOfferExpired, passengerCount, referenceUnitPrice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SearchDetailPage({ params }: { params: { id: string } }) {
  const data = await getSearchDetail(params.id);
  if (!data) notFound();

  const { search, best, aiExplanation, pricePosition, stats, priceHistory, recentRuns, recentAlerts, resultsFound, primaryRoute } = data;
  // Every price shown alongside targetPrice/promedio/mínimo uses the
  // per-adult reference price — the party total is shown separately,
  // labelled, never side-by-side with a differently-scaled number.
  const bestUnitPrice = best ? referenceUnitPrice(best.flightResult) : null;
  const bestPax = best ? passengerCount(best.flightResult.passengers) : 1;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SearchSubnav searchId={search.id} searchName={search.name} active="detail" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-base-50">{search.name}</h1>
            <StatusPill status={search.status} />
          </div>
          <p className="text-sm text-base-400">
            {search.origins.join("/")} → {search.destinations.join("/")} ·{" "}
            {search.tripType === "round_trip" ? "Ida y vuelta" : "Solo ida"} · {passengerCount(search.passengers)} pasajeros
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/searches/${search.id}/edit`} className="btn-secondary text-sm">
            Editar
          </Link>
          <RunNowButton searchId={search.id} />
        </div>
      </div>

      {search.lastError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          🔴 Error en la última ejecución: {search.lastError}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Última ejecución" value={hoursSince(search.lastRunAt)} hint={search.lastRunAt ? dateTime(search.lastRunAt) : undefined} />
        <MetricCard label="Próxima ejecución" value={search.nextRunAt ? dateTime(search.nextRunAt) : "—"} />
        <MetricCard label="Resultados encontrados" value={resultsFound} />
        <MetricCard label="Último precio" value={bestUnitPrice !== null ? money(bestUnitPrice, search.currency) : "—"} />
        <MetricCard label="Mejor precio histórico" value={money(stats?.min ?? null, search.currency)} />
        <MetricCard label="Precio objetivo" value={money(search.targetPrice, search.currency)} />
        <MetricCard
          label="Requests última corrida"
          value={recentRuns[0] ? `${recentRuns[0].requestsUsed} / ${search.requestBudget.maxRequestsPerRun}` : "—"}
          hint={recentRuns[0] ? `${recentRuns[0].cacheHits} cache hits` : undefined}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <h2 className="mb-3 section-title">Mejor combinación</h2>
          {!best ? (
            <p className="text-sm text-base-400">
              Todavía no hay resultados para esta búsqueda. Ejecutala para que el motor analice combinaciones de fechas, horarios y
              aeropuertos.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-base-50">
                    {best.flightResult.origin} → {best.flightResult.destination}
                  </div>
                  <div className="text-sm text-base-400">
                    {fullDate(best.flightResult.outbound.departureDateTime)}
                    {best.flightResult.inbound ? ` → ${fullDate(best.flightResult.inbound.departureDateTime)}` : ""}
                  </div>
                </div>
                <OpportunityBadge level={best.opportunity.level} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-white/5 bg-base-850 p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-base-500">Datos</div>
                  <div className="text-xl font-bold text-base-50">
                    {money(best.flightResult.price.effectivePrice, best.flightResult.price.currency)}
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-base-400">
                    {best.flightResult.price.passengers.pricingBreakdownAvailable ? (
                      <>
                        <div>Adulto: {money(best.flightResult.price.passengers.adultPrice, best.flightResult.price.currency)}</div>
                        {best.flightResult.price.passengers.childPrices.map((p, i) => (
                          <div key={i}>Niño {i + 1}: {money(p, best.flightResult.price.currency)}</div>
                        ))}
                      </>
                    ) : (
                      <div>Desglose por pasajero: no informado por el proveedor (precio total de la reserva)</div>
                    )}
                    <div>Tasas: {best.flightResult.price.fees !== null ? money(best.flightResult.price.fees) : "no informado"}</div>
                    <div>
                      {best.flightResult.baggage.included === null
                        ? "Equipaje: no informado"
                        : best.flightResult.baggage.included
                          ? `Equipaje incluido (${best.flightResult.baggage.checkedBags ?? "?"} valija(s))`
                          : `Equipaje no incluido${best.flightResult.baggage.addCost !== null ? ` (+${money(best.flightResult.baggage.addCost)})` : ""}`}
                    </div>
                    <div>{best.flightResult.outbound.stops + (best.flightResult.inbound?.stops ?? 0)} escala(s)</div>
                    {isOfferExpired(best.flightResult) && (
                      <div className="text-amber-400">Este precio puede haber cambiado. Actualizar precio.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-white/5 bg-base-850 p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-base-500">Análisis</div>
                  <div className="space-y-0.5 text-xs text-base-300">
                    {bestUnitPrice !== null && (
                      <div>
                        Precio de referencia (por adulto): {money(bestUnitPrice, search.currency)}
                        {bestPax > 1 ? ` · ${bestPax} pasajeros` : ""}
                      </div>
                    )}
                    <div>vs. objetivo: {pct(best.opportunity.vsTarget)}</div>
                    <div>vs. promedio: {pct(best.opportunity.vsAverage)}</div>
                    <div>vs. mínimo histórico: {pct(best.opportunity.vsMin)}</div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-base-400">{aiExplanation}</p>
                  {pricePosition && <p className="mt-1 text-xs italic text-base-500">{pricePosition.description}</p>}
                </div>

                <div className="rounded-lg border border-white/5 bg-base-850 p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-base-500">Alerta</div>
                  {best.opportunity.passedRuleIds.length === 0 ? (
                    <p className="text-xs text-base-500">No cumple ninguna regla configurada.</p>
                  ) : (
                    <ul className="space-y-1 text-xs text-emerald-300">
                      {best.opportunity.rules
                        .filter((r) => r.passed)
                        .map((r) => (
                          <li key={r.id}>✓ {r.label}</li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>

              {best.flightResult.booking.type === "deep_link" || best.flightResult.booking.type === "search_link" ? (
                isOfferExpired(best.flightResult) ? (
                  <span className="self-start text-xs text-amber-400">Oferta expirada — actualizar precio</span>
                ) : (
                  <a href={best.flightResult.booking.url} target="_blank" rel="noreferrer" className="btn-secondary self-start text-xs">
                    Ver vuelo (demo) ↗
                  </a>
                )
              ) : best.flightResult.booking.type === "api_order" ? (
                <span className="self-start text-xs text-base-500">Reserva vía API (sin enlace directo disponible)</span>
              ) : (
                <span className="self-start text-xs text-base-500">Sin enlace de reserva disponible</span>
              )}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h2 className="mb-3 section-title">Explorar</h2>
          <div className="flex flex-col gap-2 text-sm">
            <Link href={`/searches/${search.id}/calendar`} className="btn-secondary justify-start">
              📅 Calendario de precios
            </Link>
            <Link href={`/searches/${search.id}/schedule`} className="btn-secondary justify-start">
              🕐 Análisis de horarios
            </Link>
            <Link href={`/searches/${search.id}/compare`} className="btn-secondary justify-start">
              ⇄ Comparador de vuelos
            </Link>
            <Link href={`/alerts?searchId=${search.id}`} className="btn-secondary justify-start">
              🔔 Alertas de esta búsqueda
            </Link>
            <Link href={`/logs?searchId=${search.id}`} className="btn-secondary justify-start">
              📜 Historial de ejecuciones
            </Link>
            <a href={`/api/export/results?searchId=${search.id}`} className="btn-secondary justify-start">
              ⭳ Exportar resultados (CSV)
            </a>
            <Link href={`/api-usage?searchId=${search.id}`} className="btn-secondary justify-start">
              📊 Uso de API
            </Link>
          </div>
        </div>
      </section>

      <section className="card card-pad">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="section-title">Histórico</h2>
          {primaryRoute && (
            <span className="text-xs text-base-500">
              {primaryRoute.origin} → {primaryRoute.destination}
            </span>
          )}
        </div>
        <PriceHistoryChart data={priceHistory} currency={search.currency} />
        {stats && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/5 pt-3 sm:grid-cols-5">
            <Stat label="Promedio" value={money(stats.average, search.currency)} />
            <Stat label="Mediana" value={money(stats.median, search.currency)} />
            <Stat label="Mínimo" value={money(stats.min, search.currency)} />
            <Stat label="Percentil 25" value={money(stats.p25, search.currency)} />
            <Stat label="Últimos 30 días" value={money(stats.last30d, search.currency)} />
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card card-pad">
          <h2 className="mb-3 section-title">Últimas ejecuciones</h2>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-base-500">Sin ejecuciones todavía.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {recentRuns.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                  <span className="text-base-400">{dateTime(r.startedAt)}</span>
                  <span className="text-base-300">
                    {r.flightsFound} vuelos · {r.opportunitiesFound} oportunidades · {r.alertsSent} alertas
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card card-pad">
          <h2 className="mb-3 section-title">Últimas alertas</h2>
          {recentAlerts.length === 0 ? (
            <p className="text-sm text-base-500">Sin alertas todavía.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {recentAlerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                  <span className="text-base-400">{fullDate(a.departureDate)}</span>
                  <span className="text-base-300">{money(a.totalPrice, a.currency)}</span>
                  <span className="text-xs text-base-500">{a.status === "sent" ? "Enviada" : "Pendiente"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-base-500">{label}</div>
      <div className="text-sm font-medium text-base-200">{value}</div>
    </div>
  );
}
