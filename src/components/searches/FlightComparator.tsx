"use client";

import { useMemo, useState } from "react";
import { FlightResult } from "@/lib/types";
import { durationLabel, fullDate, money, timeOnly } from "@/lib/utils/format";

const MAX_SELECTION = 4;

export function FlightComparator({ flights }: { flights: FlightResult[] }) {
  const [selected, setSelected] = useState<string[]>(flights.slice(0, 3).map((f) => f.id));

  const selectedFlights = useMemo(
    () => selected.map((id) => flights.find((f) => f.id === id)).filter((f): f is FlightResult => Boolean(f)),
    [selected, flights],
  );

  function toggle(id: string) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_SELECTION) return cur;
      return [...cur, id];
    });
  }

  const rows: { label: string; render: (f: FlightResult) => React.ReactNode }[] = [
    { label: "Precio", render: (f) => <span className="font-semibold text-base-50">{money(f.price.effectivePrice, f.price.currency)}</span> },
    { label: "Aerolínea", render: (f) => f.outbound.airline },
    {
      label: "Equipaje",
      render: (f) => (f.baggage.included === null ? "No informado" : f.baggage.included ? "Sí" : "No"),
    },
    { label: "Escalas", render: (f) => f.outbound.stops + (f.inbound?.stops ?? 0) },
    {
      label: "Duración",
      render: (f) => durationLabel(f.outbound.durationMinutes + (f.inbound?.durationMinutes ?? 0)),
    },
    { label: "Fecha salida", render: (f) => fullDate(f.outbound.departureDateTime) },
    { label: "Hora salida", render: (f) => timeOnly(f.outbound.departureDateTime) },
    ...(flights.some((f) => f.inbound)
      ? [
          { label: "Fecha regreso", render: (f: FlightResult) => (f.inbound ? fullDate(f.inbound.departureDateTime) : "—") },
          { label: "Hora regreso", render: (f: FlightResult) => (f.inbound ? timeOnly(f.inbound.departureDateTime) : "—") },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="card card-pad">
        <div className="mb-2 text-xs text-base-500">Seleccioná hasta {MAX_SELECTION} vuelos para comparar objetivamente.</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {flights.map((f) => (
            <label
              key={f.id}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-base-850 px-3 py-2 text-xs text-base-300"
            >
              <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f.id)} />
              <span>
                {f.outbound.airline} {f.outbound.flightNumber} · {money(f.price.effectivePrice, f.price.currency)} ·{" "}
                {timeOnly(f.outbound.departureDateTime)}
              </span>
            </label>
          ))}
        </div>
      </div>

      {selectedFlights.length === 0 ? (
        <div className="card card-pad text-sm text-base-400">Seleccioná al menos un vuelo para ver la comparación.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs uppercase tracking-wide text-base-500">
                <th className="px-4 py-3 text-left font-medium">Atributo</th>
                {selectedFlights.map((f, i) => (
                  <th key={f.id} className="px-4 py-3 text-left font-medium text-base-300">
                    Vuelo {String.fromCharCode(65 + i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-2.5 text-base-400">{row.label}</td>
                  {selectedFlights.map((f) => (
                    <td key={f.id} className="px-4 py-2.5 text-base-200">
                      {row.render(f)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
