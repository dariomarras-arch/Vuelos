// ---------------------------------------------------------------------------
// Time-slot analysis — aggregates observed flights into the 6 four-hour
// bands and reports average price + sample count per band. The app never
// assumes a fixed "always cheaper" slot; this is what lets each route
// discover its own pattern statistically.
// ---------------------------------------------------------------------------

import { FlightResult, TIME_SLOTS, TimeSlotKey, TimeSlotStat } from "@/lib/types";
import { mean, round2 } from "./stats";

export function aggregateTimeSlots(
  flights: FlightResult[],
  leg: "outbound" | "inbound",
): TimeSlotStat[] {
  const bySlot = new Map<TimeSlotKey, number[]>();
  for (const slot of TIME_SLOTS) bySlot.set(slot, []);

  for (const flight of flights) {
    const l = leg === "outbound" ? flight.outbound : flight.inbound;
    if (!l) continue;
    bySlot.get(l.departureTimeSlot)?.push(flight.price.effectivePrice);
  }

  return TIME_SLOTS.map((slot) => {
    const prices = bySlot.get(slot) ?? [];
    return {
      slot,
      averagePrice: round2(mean(prices)),
      flightCount: prices.length,
    };
  });
}

export function bestTimeSlot(stats: TimeSlotStat[]): TimeSlotStat | null {
  const withData = stats.filter((s) => s.averagePrice !== null);
  if (withData.length === 0) return null;
  return withData.reduce((best, cur) => (cur.averagePrice! < best.averagePrice! ? cur : best));
}
