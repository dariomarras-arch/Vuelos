// ---------------------------------------------------------------------------
// View-model builder for the global dashboard ("/"). Aggregates across all
// of the user's searches: best opportunities, a representative price
// history, best dates and best time slots for the search with the richest
// data. Kept out of the page component so it's testable independently of
// React.
// ---------------------------------------------------------------------------

import { DEMO_USER_ID } from "@/lib/constants";
import { getReadyRepository } from "@/lib/data/ready";
import { getActiveProvider } from "@/lib/providers";
import { computeHistoricalStats } from "@/lib/analytics/stats";
import { evaluateOpportunity } from "@/lib/analytics/opportunity";
import { aggregateTimeSlots } from "@/lib/analytics/timeSlots";
import { bestDates } from "@/lib/analytics/calendar";
import { buildRoutes } from "@/lib/engine/combinations";
import {
  BestCombination,
  CalendarDayPrice,
  FlightSearch,
  HistoricalStats,
  TimeSlotStat,
} from "@/lib/types";

export interface DashboardData {
  searches: FlightSearch[];
  topOpportunities: BestCombination[];
  primarySearch: FlightSearch | null;
  primaryRoute: { origin: string; destination: string } | null;
  priceHistory: { date: string; price: number }[];
  bestDates: CalendarDayPrice[];
  timeSlots: TimeSlotStat[];
  stats: HistoricalStats | null;
  totals: {
    opportunitiesDetected: number;
    alertsSent: number;
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const repo = await getReadyRepository();
  const provider = getActiveProvider();
  const searches = await repo.listSearches(DEMO_USER_ID);

  const combinations: BestCombination[] = [];
  let opportunitiesDetected = 0;
  let alertsSent = 0;

  for (const search of searches) {
    const results = await repo.latestFlightResults(search.id);
    const alerts = await repo.listAlerts(search.id);
    alertsSent += alerts.filter((a) => a.status === "sent").length;

    const statsCache = new Map<string, HistoricalStats>();
    for (const flight of results) {
      const key = `${flight.origin}-${flight.destination}`;
      if (!statsCache.has(key)) {
        const history = await repo.getPriceHistory(flight.origin, flight.destination, 90);
        statsCache.set(key, computeHistoricalStats(history));
      }
      const stats = statsCache.get(key)!;
      const evaluation = evaluateOpportunity({
        flight,
        targetPrice: search.targetPrice,
        maxPrice: search.maxPrice,
        historicalStats: stats,
        previousBestPrice: stats.min,
      });
      if (evaluation.level !== "NORMAL" && evaluation.level !== "ALTO") opportunitiesDetected++;
      combinations.push({ flightResult: flight, opportunity: evaluation });
    }
  }

  combinations.sort((a, b) => b.opportunity.score - a.opportunity.score);
  const topOpportunities = combinations.slice(0, 5);

  const primarySearch = searches[0] ?? null;
  let priceHistory: { date: string; price: number }[] = [];
  let bestDatesResult: CalendarDayPrice[] = [];
  let timeSlots: TimeSlotStat[] = [];
  let stats: HistoricalStats | null = null;
  let primaryRoute: { origin: string; destination: string } | null = null;

  if (primarySearch) {
    const routes = buildRoutes(primarySearch, 1);
    const route = routes[0];
    if (route) {
      primaryRoute = route;
      const history = await repo.getPriceHistory(route.origin, route.destination, 90);
      stats = computeHistoricalStats(history);
      priceHistory = history.map((h) => ({ date: h.timestamp.slice(0, 10), price: h.effectivePrice }));

      const calendar = await provider.getPriceCalendar({
        origin: route.origin,
        destination: route.destination,
        dateFrom: primarySearch.dateFrom,
        dateTo: primarySearch.dateTo,
        tripType: primarySearch.tripType,
        nights: primarySearch.tripType === "round_trip" ? primarySearch.minNights : null,
        currency: primarySearch.currency,
      });
      bestDatesResult = bestDates(calendar, 4);

      const latestResults = await repo.latestFlightResults(primarySearch.id);
      timeSlots = aggregateTimeSlots(
        latestResults.filter((r) => r.origin === route.origin && r.destination === route.destination),
        "outbound",
      );
    }
  }

  return {
    searches,
    topOpportunities,
    primarySearch,
    primaryRoute,
    priceHistory,
    bestDates: bestDatesResult,
    timeSlots,
    stats,
    totals: { opportunitiesDetected, alertsSent },
  };
}
