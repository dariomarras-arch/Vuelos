// ---------------------------------------------------------------------------
// Scheduler frequency — decides how many times per day a search should run
// depending on how close its departure window is. Buckets are configurable
// (see SchedulerBucket) so they can be edited from the settings screen
// without touching code.
// ---------------------------------------------------------------------------

import { differenceInCalendarDays, parseISO } from "date-fns";
import { FlightSearch, SchedulerBucket } from "@/lib/types";

export const DEFAULT_SCHEDULER_BUCKETS: SchedulerBucket[] = [
  { id: "far", label: "Normal (> 120 días)", daysToDepartureMin: 120, daysToDepartureMax: null, runsPerDay: 2 },
  { id: "mid", label: "60–120 días", daysToDepartureMin: 60, daysToDepartureMax: 120, runsPerDay: 4 },
  { id: "near", label: "30–60 días", daysToDepartureMin: 30, daysToDepartureMax: 60, runsPerDay: 6 },
  { id: "soon", label: "Menos de 30 días", daysToDepartureMin: 0, daysToDepartureMax: 30, runsPerDay: 6 }, // ~ every 4h
];

export function daysToDeparture(search: FlightSearch, from: Date = new Date()): number {
  const earliest = parseISO(search.dateFrom);
  return Math.max(0, differenceInCalendarDays(earliest, from));
}

export function bucketFor(days: number, buckets: SchedulerBucket[] = DEFAULT_SCHEDULER_BUCKETS): SchedulerBucket {
  const sorted = [...buckets].sort((a, b) => a.daysToDepartureMin - b.daysToDepartureMin);
  for (const bucket of sorted) {
    const max = bucket.daysToDepartureMax ?? Infinity;
    if (days >= bucket.daysToDepartureMin && days < max) return bucket;
  }
  return sorted[sorted.length - 1];
}

export function runsPerDayFor(search: FlightSearch, buckets: SchedulerBucket[] = DEFAULT_SCHEDULER_BUCKETS): number {
  return bucketFor(daysToDeparture(search), buckets).runsPerDay;
}

export function computeNextRunAt(
  search: FlightSearch,
  from: Date = new Date(),
  buckets: SchedulerBucket[] = DEFAULT_SCHEDULER_BUCKETS,
): Date {
  const runsPerDay = runsPerDayFor(search, buckets);
  const intervalHours = 24 / runsPerDay;
  return new Date(from.getTime() + intervalHours * 60 * 60 * 1000);
}
