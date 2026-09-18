import { getReadyRepository } from "@/lib/data/ready";
import { computeHistoricalStats } from "@/lib/analytics/stats";
import { evaluateOpportunity } from "@/lib/analytics/opportunity";
import { explainOpportunity } from "@/lib/ai/explain";
import { buildRoutes } from "@/lib/engine/combinations";
import { Alert, BestCombination, FlightSearch, HistoricalStats, SearchRun } from "@/lib/types";

export interface SearchDetailData {
  search: FlightSearch;
  best: BestCombination | null;
  aiExplanation: string | null;
  stats: HistoricalStats | null;
  priceHistory: { date: string; price: number }[];
  recentRuns: SearchRun[];
  recentAlerts: Alert[];
  resultsFound: number;
  primaryRoute: { origin: string; destination: string } | null;
}

export async function getSearchDetail(searchId: string): Promise<SearchDetailData | null> {
  const repo = await getReadyRepository();
  const search = await repo.getSearch(searchId);
  if (!search) return null;

  const results = await repo.latestFlightResults(searchId);
  const routes = buildRoutes(search, 1);
  const primaryRoute = routes[0] ?? null;

  let stats: HistoricalStats | null = null;
  let priceHistory: { date: string; price: number }[] = [];
  if (primaryRoute) {
    const history = await repo.getPriceHistory(primaryRoute.origin, primaryRoute.destination, 90);
    stats = computeHistoricalStats(history);
    priceHistory = history.map((h) => ({ date: h.timestamp.slice(0, 10), price: h.effectivePrice }));
  }

  let best: BestCombination | null = null;
  let aiExplanation: string | null = null;
  if (results.length > 0) {
    const statsCache = new Map<string, HistoricalStats>();
    for (const flight of results) {
      const key = `${flight.origin}-${flight.destination}`;
      if (!statsCache.has(key)) {
        const history = await repo.getPriceHistory(flight.origin, flight.destination, 90);
        statsCache.set(key, computeHistoricalStats(history));
      }
      const flightStats = statsCache.get(key)!;
      const evaluation = evaluateOpportunity({
        flight,
        targetPrice: search.targetPrice,
        maxPrice: search.maxPrice,
        historicalStats: flightStats,
        previousBestPrice: flightStats.min,
      });
      if (!best || flight.price.effectivePrice < best.flightResult.price.effectivePrice) {
        best = { flightResult: flight, opportunity: evaluation };
      }
    }
    if (best) {
      const key = `${best.flightResult.origin}-${best.flightResult.destination}`;
      aiExplanation = explainOpportunity({
        flight: best.flightResult,
        historicalStats: statsCache.get(key)!,
        level: best.opportunity.level,
        targetPrice: search.targetPrice,
        maxPrice: search.maxPrice,
      });
    }
  }

  const recentRuns = await repo.listSearchRuns(searchId, 5);
  const recentAlerts = (await repo.listAlerts(searchId)).slice(0, 5);

  return {
    search,
    best,
    aiExplanation,
    stats,
    priceHistory,
    recentRuns,
    recentAlerts,
    resultsFound: results.length,
    primaryRoute,
  };
}
