import { notFound } from "next/navigation";
import { getScheduleData } from "@/lib/view/schedule";
import { TimeSlotChart } from "@/components/charts/TimeSlotChart";
import { SearchSubnav } from "@/components/searches/SearchSubnav";
import { money } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ params }: { params: { id: string } }) {
  const data = await getScheduleData(params.id);
  if (!data) notFound();

  const { search, outboundSlots, returnSlots, bestOutbound, bestReturn } = data;
  const totalFlights = outboundSlots.reduce((sum, s) => sum + s.flightCount, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SearchSubnav searchId={search.id} searchName={search.name} active="schedule" />

      <div>
        <h1 className="text-xl font-bold text-base-50">Análisis de horarios</h1>
        <p className="text-sm text-base-400">
          Precio promedio y cantidad de vuelos observados por franja horaria, calculado sobre {totalFlights} resultados
          acumulados. El sistema no asume que un horario es siempre más barato — lo determina estadísticamente para esta ruta.
        </p>
      </div>

      {totalFlights === 0 ? (
        <div className="card card-pad text-sm text-base-400">
          Todavía no hay suficientes resultados. Ejecutá la búsqueda para empezar a acumular datos por horario.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="card card-pad">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="section-title">Ida</h2>
              {bestOutbound && (
                <span className="text-xs text-accent-400">
                  Mejor franja: {bestOutbound.slot} ({money(bestOutbound.averagePrice, search.currency)})
                </span>
              )}
            </div>
            <TimeSlotChart data={outboundSlots} currency={search.currency} />
            <SlotTable slots={outboundSlots} currency={search.currency} />
          </section>

          {search.tripType === "round_trip" && (
            <section className="card card-pad">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="section-title">Vuelta</h2>
                {bestReturn && (
                  <span className="text-xs text-accent-400">
                    Mejor franja: {bestReturn.slot} ({money(bestReturn.averagePrice, search.currency)})
                  </span>
                )}
              </div>
              <TimeSlotChart data={returnSlots} currency={search.currency} />
              <SlotTable slots={returnSlots} currency={search.currency} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SlotTable({ slots, currency }: { slots: { slot: string; averagePrice: number | null; flightCount: number }[]; currency: string }) {
  return (
    <table className="mt-3 w-full text-xs">
      <thead className="text-base-500">
        <tr>
          <th className="py-1 text-left font-medium">Franja</th>
          <th className="py-1 text-right font-medium">Precio promedio</th>
          <th className="py-1 text-right font-medium">Vuelos</th>
        </tr>
      </thead>
      <tbody>
        {slots.map((s) => (
          <tr key={s.slot} className="border-t border-white/5">
            <td className="py-1 text-base-300">{s.slot}</td>
            <td className="py-1 text-right text-base-200">{money(s.averagePrice, currency)}</td>
            <td className="py-1 text-right text-base-400">{s.flightCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
