import { startOfDay } from "date-fns";
import { getReadyRepository } from "@/lib/data/ready";
import { DEMO_USER_ID } from "@/lib/constants";
import { ApiUsageSummary, FlightSearch, SearchRun } from "@/lib/types";

export interface ApiUsageData {
  searches: FlightSearch[];
  selectedSearch: FlightSearch | null;
  summary: ApiUsageSummary;
  recentRuns: SearchRun[];
}

export async function getApiUsageData(searchId?: string): Promise<ApiUsageData> {
  const repo = await getReadyRepository();
  const searches = await repo.listSearches(DEMO_USER_ID);
  const selectedSearch = searches.find((s) => s.id === searchId) ?? searches[0] ?? null;

  if (!selectedSearch) {
    return {
      searches,
      selectedSearch: null,
      summary: { requestsToday: 0, limitToday: 0, requestsLastRun: 0, limitPerRun: 0, errors: 0, rateLimited: 0, cacheHits: 0, cacheMisses: 0 },
      recentRuns: [],
    };
  }

  const todayStartISO = startOfDay(new Date()).toISOString();
  const logToday = await repo.listRequestLog({ searchId: selectedSearch.id, sinceISO: todayStartISO });
  const requestsToday = logToday.filter((r) => r.outcome !== "cache_hit").length;
  const cacheHits = logToday.filter((r) => r.outcome === "cache_hit").length;
  const errors = logToday.filter((r) => r.outcome === "error").length;
  const rateLimited = logToday.filter((r) => r.errorCode === "RATE_LIMITED").length;

  const recentRuns = await repo.listSearchRuns(selectedSearch.id, 10);
  const lastRun = recentRuns[0];

  const summary: ApiUsageSummary = {
    requestsToday,
    limitToday: selectedSearch.requestBudget.maxRequestsPerDay,
    requestsLastRun: lastRun?.requestsUsed ?? 0,
    limitPerRun: selectedSearch.requestBudget.maxRequestsPerRun,
    errors,
    rateLimited,
    cacheHits,
    cacheMisses: requestsToday,
  };

  return { searches, selectedSearch, summary, recentRuns };
}
