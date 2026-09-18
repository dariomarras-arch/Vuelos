// ---------------------------------------------------------------------------
// Alert deduplication — never send two alerts for the same flight/price.
// The dedupe key intentionally buckets price into $5 increments so tiny
// market noise between runs (a couple of dollars) doesn't count as a "new"
// price worth re-alerting.
// ---------------------------------------------------------------------------

import { FlightResult } from "@/lib/types";

const PRICE_BUCKET = 5;

export function buildDedupeKey(flight: FlightResult): string {
  const bucketed = Math.round(flight.price.effectivePrice / PRICE_BUCKET) * PRICE_BUCKET;
  const returnKey = flight.inbound ? flight.inbound.departureDateTime.slice(0, 10) : "oneway";
  return [
    flight.searchId,
    flight.origin,
    flight.destination,
    flight.outbound.departureDateTime.slice(0, 10),
    returnKey,
    flight.outbound.flightNumber,
    bucketed,
  ].join(":");
}
