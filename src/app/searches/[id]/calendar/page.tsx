import { notFound } from "next/navigation";
import { getCalendarData } from "@/lib/view/calendar";
import { BestDatesChart } from "@/components/charts/BestDatesChart";
import { SearchSubnav } from "@/components/searches/SearchSubnav";
import { fullDate, money } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ params }: { params: { id: string } }) {
  const data = await getCalendarData(params.id);
  if (!data) notFound();

  const { search, route, outboundCalendar, returnCalendar, bestOutboundDates, shiftInsight } = data;
  const cheapestOutbound = outboundCalendar.length
    ? Math.min(...outboundCalendar.filter((d) => d.price !== null).map((d) => d.price as number))
    : null;
  const cheapestReturn = returnCalendar.length
    ? Math.min(...returnCalendar.filter((d) => d.price !== null).map((d) => d.price as number))
    : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SearchSubnav searchId={search.id} searchName={search.name} active="calendar" />

      <div>
        <h1 className="text-xl font-bold text-base-50">Calendario de precios</h1>
        {route && (
          <p className="text-sm text-base-400">
            {route.origin} → {route.destination} · {search.dateFrom} a {search.dateTo}
          </p>
        )}
      </div>

      {!route ? (
        <div className="card card-pad text-sm text-base-400">Configurá origen y destino para ver el calendario.</div>
      ) : (
        <>
          <section className="card card-pad">
            <h2 className="mb-1 section-title">Mejores fechas</h2>
            <p className="mb-2 text-xs text-base-500">Fecha de salida más económica dentro del rango configurado.</p>
            <BestDatesChart data={bestOutboundDates.map((d) => ({ date: d.date, price: d.price ?? 0 }))} currency={search.currency} />
          </section>

          {shiftInsight && (
            <div className="rounded-lg border border-accent-500/20 bg-accent-500/5 px-4 py-3 text-sm text-base-200">
              Moviendo la fecha de ida de {fullDate(shiftInsight.fromDate)} a {fullDate(shiftInsight.toDate)} (
              {shiftInsight.daysShifted > 0 ? "+" : ""}
              {shiftInsight.daysShifted} días) el precio calculado baja {money(shiftInsight.differencePerPax, search.currency)} por
              pasajero, según los datos analizados. Esto es una diferencia calculada, no una recomendación de compra.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="card card-pad">
              <h2 className="mb-3 section-title">Ida — {route.origin} → {route.destination}</h2>
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-base-900 text-xs uppercase tracking-wide text-base-500">
                    <tr>
                      <th className="py-1.5 text-left font-medium">Fecha</th>
                      <th className="py-1.5 text-right font-medium">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboundCalendar.map((d) => (
                      <tr key={d.date} className="border-t border-white/5">
                        <td className="py-1.5 text-base-300">{fullDate(d.date)}</td>
                        <td
                          className={`py-1.5 text-right font-medium ${
                            d.price === cheapestOutbound ? "text-accent-400" : "text-base-200"
                          }`}
                        >
                          {money(d.price, search.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {search.tripType === "round_trip" && (
              <section className="card card-pad">
                <h2 className="mb-3 section-title">
                  Vuelta — {route.destination} → {route.origin}
                </h2>
                <div className="max-h-96 overflow-y-auto scrollbar-thin">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-base-900 text-xs uppercase tracking-wide text-base-500">
                      <tr>
                        <th className="py-1.5 text-left font-medium">Fecha</th>
                        <th className="py-1.5 text-right font-medium">Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnCalendar.map((d) => (
                        <tr key={d.date} className="border-t border-white/5">
                          <td className="py-1.5 text-base-300">{fullDate(d.date)}</td>
                          <td
                            className={`py-1.5 text-right font-medium ${
                              d.price === cheapestReturn ? "text-accent-400" : "text-base-200"
                            }`}
                          >
                            {money(d.price, search.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
