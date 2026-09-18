import Link from "next/link";
import { BestCombination } from "@/lib/types";
import { OpportunityBadge } from "@/components/ui/OpportunityBadge";
import { fullDate, money, pct } from "@/lib/utils/format";

export function OpportunityCard({ combo }: { combo: BestCombination }) {
  const { flightResult: flight, opportunity } = combo;
  const stops = flight.outbound.stops + (flight.inbound?.stops ?? 0);

  return (
    <div className="card card-pad flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-base-50">
            {flight.origin} → {flight.destination}
          </div>
          <div className="text-xs text-base-400">
            {fullDate(flight.outbound.departureDateTime)}
            {flight.inbound ? ` → ${fullDate(flight.inbound.departureDateTime)}` : ""}
          </div>
        </div>
        <OpportunityBadge level={opportunity.level} />
      </div>

      <div>
        <div className="text-2xl font-bold text-base-50">{money(flight.price.effectivePrice, flight.price.currency)}</div>
        {opportunity.vsAverage !== null && (
          <div className={opportunity.vsAverage < 0 ? "text-sm text-emerald-400" : "text-sm text-red-400"}>
            {opportunity.vsAverage < 0 ? "↓" : "↑"} {pct(Math.abs(opportunity.vsAverage)).replace("+", "")} vs. promedio
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-400">
        <span>{stops === 0 ? "Vuelo directo" : `${stops} escala${stops > 1 ? "s" : ""}`}</span>
        <span>{flight.baggageIncluded ? "Equipaje incluido" : "Sin equipaje incluido"}</span>
      </div>

      <Link href={`/searches/${flight.searchId}`} className="btn-secondary mt-1 w-full text-xs">
        Ver detalle
      </Link>
    </div>
  );
}
