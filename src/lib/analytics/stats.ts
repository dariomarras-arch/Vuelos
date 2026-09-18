// ---------------------------------------------------------------------------
// Basic descriptive statistics over historical price series.
// Pure functions, no I/O — easy to unit test and reuse from API routes,
// server components or the scheduler.
// ---------------------------------------------------------------------------

import { differenceInCalendarDays, parseISO } from "date-fns";
import { FlightPriceHistoryEntry, HistoricalStats } from "@/lib/types";

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

export function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function round2(n: number | null): number | null {
  return n === null ? null : Math.round(n * 100) / 100;
}

/**
 * Computes the full HistoricalStats block for a route from its accumulated
 * `flight_price_history` rows. Returns nulls (never zeros) when there isn't
 * enough data — the UI must render "histórico insuficiente" in that case.
 */
export function computeHistoricalStats(
  entries: FlightPriceHistoryEntry[],
  referenceDate: Date = new Date(),
): HistoricalStats {
  const prices = entries.map((e) => e.effectivePrice);

  const within = (days: number) =>
    entries
      .filter((e) => differenceInCalendarDays(referenceDate, parseISO(e.timestamp)) <= days)
      .map((e) => e.effectivePrice);

  return {
    count: entries.length,
    average: round2(mean(prices)),
    median: round2(median(prices)),
    min: prices.length ? Math.min(...prices) : null,
    max: prices.length ? Math.max(...prices) : null,
    p10: round2(percentile(prices, 10)),
    p25: round2(percentile(prices, 25)),
    last7d: round2(mean(within(7))),
    last30d: round2(mean(within(30))),
    last90d: round2(mean(within(90))),
  };
}

export function percentDiff(current: number, reference: number | null): number | null {
  if (reference === null || reference === 0) return null;
  return round2(((current - reference) / reference) * 100);
}
