import Link from "next/link";
import { FlightSearch } from "@/lib/types";
import { StatusPill } from "@/components/ui/StatusPill";
import { hoursSince, money } from "@/lib/utils/format";

export function SearchSummaryCard({ search }: { search: FlightSearch }) {
  return (
    <Link
      href={`/searches/${search.id}`}
      className="card card-pad flex flex-col gap-2 transition-colors hover:border-accent-500/30"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-base-50">
          {search.origins.join("/")} → {search.destinations.join("/")}
        </div>
        <StatusPill status={search.status} />
      </div>
      <div className="text-xs text-base-500">{search.name}</div>
      <div className="flex items-center justify-between text-xs text-base-400">
        <span>Última búsqueda: {hoursSince(search.lastRunAt)}</span>
        <span>
          Objetivo: {money(search.targetPrice, search.currency)}
        </span>
      </div>
    </Link>
  );
}
