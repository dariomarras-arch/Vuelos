// ---------------------------------------------------------------------------
// Date calendar analysis — turns a list of CalendarDayPrice into the "best
// dates" view and computes the effect of shifting the departure date, shown
// strictly as a calculated difference, never as a recommendation.
// ---------------------------------------------------------------------------

import { differenceInCalendarDays, parseISO } from "date-fns";
import { CalendarDayPrice, DateOption } from "@/lib/types";

export function bestDates(prices: CalendarDayPrice[], limit = 4): CalendarDayPrice[] {
  return [...prices]
    .filter((p) => p.price !== null)
    .sort((a, b) => (a.price! - b.price!))
    .slice(0, limit);
}

export interface DateShiftInsight {
  fromDate: string;
  toDate: string;
  priceFrom: number;
  priceTo: number;
  differencePerPax: number;
  daysShifted: number;
}

/**
 * Compares the price on `baseDate` against every other date in the series
 * and returns the single largest calculated saving from shifting the date.
 * Purely descriptive — the caller decides how (or whether) to surface it.
 */
export function bestDateShift(prices: CalendarDayPrice[], baseDate: string): DateShiftInsight | null {
  const base = prices.find((p) => p.date === baseDate && p.price !== null);
  if (!base || base.price === null) return null;

  let best: DateShiftInsight | null = null;
  for (const candidate of prices) {
    if (candidate.date === baseDate || candidate.price === null) continue;
    const diff = base.price - candidate.price;
    if (diff > 0 && (best === null || diff > best.differencePerPax)) {
      best = {
        fromDate: baseDate,
        toDate: candidate.date,
        priceFrom: base.price,
        priceTo: candidate.price,
        differencePerPax: diff,
        daysShifted: differenceInCalendarDays(parseISO(candidate.date), parseISO(baseDate)),
      };
    }
  }
  return best;
}

export function toDateOptions(prices: CalendarDayPrice[], nights: number | null): DateOption[] {
  return prices
    .filter((p) => p.price !== null)
    .map((p) => ({
      departureDate: p.date,
      returnDate: null,
      nights,
      price: p.price as number,
      currency: p.currency,
    }));
}
