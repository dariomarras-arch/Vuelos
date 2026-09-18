// ---------------------------------------------------------------------------
// runSearch — the core search engine orchestrator, v2.
//
// Two-level strategy (spec §1):
//
//   Configuración
//        ↓
//   Nivel 1 — Exploración   (cheap: ~1 price-calendar request per route,
//        ↓                   when the provider supports it)
//   Detectar zonas baratas   (deterministic priority scoring, no ML —
//        ↓                   engine/priority.ts)
//   Nivel 2 — Profundización (exact searchFlights calls, spent only on the
//        ↓                   highest-priority candidates, capped by the
//        ↓                   search's request budget)
//   Resultados detallados
//        ↓
//   Opportunity Engine       (unchanged philosophy — analytics/opportunity.ts)
//        ↓
//   Alerta
//
// Every real provider call goes through: cache lookup → rate limiter →
// call → (on failure) retry policy → request log. A failure on one
// combination never aborts the run — only AUTHENTICATION and
// QUOTA_EXCEEDED do (see providers/retryPolicy.ts RUN_ABORTING_CODES).
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto";
import { startOfDay } from "date-fns";
import { getActiveProvider } from "@/lib/providers";
import { getRepository } from "@/lib/data";
import { ProviderError, toProviderError } from "@/lib/providers/errors";
import { decideRetry, RUN_ABORTING_CODES } from "@/lib/providers/retryPolicy";
import { RateLimiter } from "@/lib/providers/rateLimiter";
import { buildCombinations, SearchCombination } from "./combinations";
import { buildSearchStrategy } from "./searchStrategy";
import { buildCalendarCacheKey, buildSearchCacheKey, shouldUseCache, ttlToMs } from "./cache";
import { scoreCandidate, sortByPriority } from "./priority";
import { filterByStrictSchedule } from "./filters";
import { computeHistoricalStats, percentDiff } from "@/lib/analytics/stats";
import { aggregateTimeSlots, bestTimeSlot } from "@/lib/analytics/timeSlots";
import { evaluateOpportunity } from "@/lib/analytics/opportunity";
import { processAlert } from "@/lib/alerts/engine";
import { computeNextRunAt } from "@/lib/scheduler/frequency";
import {
  CalendarDayPrice,
  FlightPriceHistoryEntry,
  FlightResult,
  FlightSearch,
  HistoricalStats,
  OpportunityEvaluation,
  ProviderErrorCode,
  referenceUnitPrice,
  RequestLogEndpoint,
  RequestLogOutcome,
} from "@/lib/types";

export interface RunSearchResult {
  runId: string;
  combinationsAnalyzed: number;
  flightsFound: number;
  opportunitiesFound: number;
  alertsSent: number;
  requestsUsed: number;
  cacheHits: number;
  budgetExhausted: boolean;
  bestFlight: FlightResult | null;
  bestOpportunity: OpportunityEvaluation | null;
  status: "success" | "error";
  errorMessage: string | null;
}

/** MarketObservation, persisted as a FlightPriceHistoryEntry — see types.ts MarketObservation doc comment for why these aren't two separate tables. */
function buildMarketObservation(flight: FlightResult): FlightPriceHistoryEntry {
  const booking = flight.booking.type === "deep_link" || flight.booking.type === "search_link" ? flight.booking.url : null;
  return {
    id: `${flight.id}-hist`,
    timestamp: flight.foundAt,
    searchId: flight.searchId,
    origin: flight.origin,
    destination: flight.destination,
    departureDate: flight.outbound.departureDateTime.slice(0, 10),
    returnDate: flight.inbound ? flight.inbound.departureDateTime.slice(0, 10) : null,
    airline: flight.outbound.airline,
    flightNumber: flight.outbound.flightNumber,
    departureTime: flight.outbound.departureDateTime,
    arrivalTime: flight.outbound.arrivalDateTime,
    returnTime: flight.inbound?.departureDateTime ?? null,
    stops: flight.outbound.stops + (flight.inbound?.stops ?? 0),
    durationMinutes: flight.outbound.durationMinutes + (flight.inbound?.durationMinutes ?? 0),
    baggage: flight.baggage,
    passengers: flight.passengers,
    pricingBreakdownAvailable: flight.price.passengers.pricingBreakdownAvailable,
    effectivePrice: referenceUnitPrice(flight),
    currency: flight.price.currency,
    source: flight.source,
    bookingUrl: booking,
  };
}

/** Re-stamps a cache-hit FlightResult so it belongs to THIS run while keeping its offer content (and its original — possibly already-expired — expiresAt, which is honest: it really was fetched that long ago). */
function restampForRun(flight: FlightResult, search: FlightSearch, runId: string): FlightResult {
  return { ...flight, id: `${flight.id}-r${runId.slice(0, 8)}`, searchId: search.id, searchRunId: runId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSearch(searchId: string, options: { forceRefresh?: boolean } = {}): Promise<RunSearchResult> {
  const repo = getRepository();
  const provider = getActiveProvider();
  const startedAt = new Date();
  const runId = randomUUID();
  const forceRefresh = options.forceRefresh ?? false;

  const search = await repo.getSearch(searchId);
  if (!search) {
    throw new Error(`Búsqueda ${searchId} no encontrada`);
  }

  const rateLimiter = new RateLimiter(provider.rateLimit);
  const ttlMs = ttlToMs(search.cacheTtlHours);

  let requestsUsed = 0;
  let cacheHits = 0;
  const errorsByCode: Partial<Record<ProviderErrorCode, number>> = {};
  let budgetExhausted = false;
  let abortRun = false;
  let abortCode: ProviderErrorCode | null = null;
  let abortMessage: string | null = null;
  let combinationsAnalyzed = 0;

  const todayStartISO = startOfDay(startedAt).toISOString();
  const todayLog = await repo.listRequestLog({ searchId, sinceISO: todayStartISO });
  const todayUsedBeforeRun = todayLog.filter((r) => r.outcome !== "cache_hit").length;

  async function logAttempt(endpoint: RequestLogEndpoint, outcome: RequestLogOutcome, errorCode: ProviderErrorCode | null, cacheKey: string | null) {
    await repo.logRequest({ searchId: search!.id, searchRunId: runId, timestamp: new Date().toISOString(), endpoint, outcome, errorCode, cacheKey });
    if (outcome === "cache_hit") cacheHits++;
    else requestsUsed++;
    if (outcome === "error" && errorCode) errorsByCode[errorCode] = (errorsByCode[errorCode] ?? 0) + 1;
  }

  function canSpend(): boolean {
    if (abortRun) return false;
    if (requestsUsed >= search!.requestBudget.maxRequestsPerRun) {
      budgetExhausted = true;
      return false;
    }
    if (todayUsedBeforeRun + requestsUsed >= search!.requestBudget.maxRequestsPerDay) {
      budgetExhausted = true;
      return false;
    }
    return true;
  }

  function registerAbort(err: ProviderError) {
    abortRun = true;
    abortCode = err.code;
    abortMessage = err.message;
  }

  // ---- Exploration: cached price-calendar fetch, one per route ------------
  async function fetchCalendarCached(route: { origin: string; destination: string }): Promise<CalendarDayPrice[]> {
    const key = buildCalendarCacheKey({
      origin: route.origin,
      destination: route.destination,
      dateFrom: search!.dateFrom,
      dateTo: search!.dateTo,
      nights: search!.tripType === "round_trip" ? search!.minNights : null,
      tripType: search!.tripType,
      currency: search!.currency,
    });

    const cached = await repo.getCacheEntry(key);
    if (shouldUseCache(cached, { forceRefresh })) {
      await logAttempt("getPriceCalendar", "cache_hit", null, key);
      return cached!.payload as CalendarDayPrice[];
    }

    await rateLimiter.acquire();
    try {
      const data = await provider.getPriceCalendar({
        origin: route.origin,
        destination: route.destination,
        dateFrom: search!.dateFrom,
        dateTo: search!.dateTo,
        tripType: search!.tripType,
        nights: search!.tripType === "round_trip" ? search!.minNights : null,
        currency: search!.currency,
      });
      await repo.setCacheEntry({ key, endpoint: "getPriceCalendar", payload: data, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + ttlMs).toISOString() });
      await logAttempt("getPriceCalendar", "success", null, key);
      return data;
    } catch (err) {
      const pe = toProviderError(err);
      await logAttempt("getPriceCalendar", "error", pe.code, key);
      if (RUN_ABORTING_CODES.includes(pe.code)) registerAbort(pe);
      return [];
    }
  }

  // ---- Deep search: cached exact searchFlights fetch, with retry ----------
  async function fetchExactCached(combo: SearchCombination): Promise<FlightResult[]> {
    const key = buildSearchCacheKey({
      origin: combo.origin,
      destination: combo.destination,
      departureDate: combo.departureDate,
      returnDate: combo.returnDate,
      passengers: search!.passengers,
      currency: search!.currency,
    });

    const cached = await repo.getCacheEntry(key);
    if (shouldUseCache(cached, { forceRefresh })) {
      await logAttempt("searchFlights", "cache_hit", null, key);
      return (cached!.payload as FlightResult[]).map((f) => restampForRun(f, search!, runId));
    }

    let attempt = 0;
    for (;;) {
      await rateLimiter.acquire();
      try {
        const data = await provider.searchFlights({
          origin: combo.origin,
          destination: combo.destination,
          departureDate: combo.departureDate,
          returnDate: combo.returnDate,
          tripType: search!.tripType,
          passengers: search!.passengers,
          maxStops: search!.maxStops,
          currency: search!.currency,
          searchId: search!.id,
          searchRunId: runId,
        });
        await repo.setCacheEntry({ key, endpoint: "searchFlights", payload: data, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + ttlMs).toISOString() });
        await logAttempt("searchFlights", "success", null, key);
        return data;
      } catch (err) {
        const pe = toProviderError(err);
        await logAttempt("searchFlights", "error", pe.code, key);
        const decision = decideRetry(pe.code, attempt, pe.retryAfterMs);
        if (decision.abortRun) {
          registerAbort(pe);
          return [];
        }
        if (decision.shouldRetry) {
          attempt++;
          await sleep(decision.delayMs);
          continue;
        }
        return []; // not retryable — skip this combination, keep the run going
      }
    }
  }

  try {
    const strategy = buildSearchStrategy(search, provider.capabilities, todayUsedBeforeRun);
    const allResults: FlightResult[] = [];

    // ---- Nivel 1 — Exploración -------------------------------------------
    const calendarByRoute = new Map<string, CalendarDayPrice[]>();
    if (strategy.mode === "calendar_then_deep") {
      for (const route of strategy.routes) {
        if (!canSpend()) break;
        const data = await fetchCalendarCached(route);
        combinationsAnalyzed++;
        calendarByRoute.set(`${route.origin}-${route.destination}`, data);
        if (abortRun) break;
      }
    }

    // ---- Detectar zonas baratas (priorización determinística) -----------
    let deepSearchQueue: SearchCombination[] = [];

    if (strategy.mode === "calendar_then_deep" && !abortRun) {
      const statsCache = new Map<string, HistoricalStats>();
      async function statsFor(origin: string, destination: string): Promise<HistoricalStats> {
        const key = `${origin}-${destination}`;
        if (!statsCache.has(key)) {
          const history = await repo.getPriceHistory(origin, destination, 90);
          statsCache.set(key, computeHistoricalStats(history));
        }
        return statsCache.get(key)!;
      }

      const primaryRoute = strategy.routes[0];
      const primaryStats = primaryRoute ? await statsFor(primaryRoute.origin, primaryRoute.destination) : null;

      const scored: (SearchCombination & { score: number })[] = [];

      for (const route of strategy.routes) {
        const calendar = calendarByRoute.get(`${route.origin}-${route.destination}`) ?? [];
        const stats = await statsFor(route.origin, route.destination);

        const priorResults = (await repo.listFlightResults(search.id, 500)).filter(
          (r) => r.origin === route.origin && r.destination === route.destination,
        );
        const slotStats = aggregateTimeSlots(priorResults, "outbound");
        const bestSlot = bestTimeSlot(slotStats);

        const isAlternative = primaryRoute ? route.origin !== primaryRoute.origin || route.destination !== primaryRoute.destination : false;
        const altDiscount =
          isAlternative && primaryStats?.average ? percentDiff(stats.average ?? 0, primaryStats.average) : null;

        for (const day of calendar) {
          if (day.price === null) continue;
          const { score } = scoreCandidate(day.price, {
            historicalStats: stats,
            targetPrice: search.targetPrice,
            bestHistoricalSlot: bestSlot,
            averageSlotPrice: stats.average,
            isAlternativeAirport: isAlternative,
            alternativeAirportDiscountPercent: altDiscount,
          });

          const nights = search.tripType === "round_trip" ? search.minNights : null;
          const returnDate =
            nights !== null ? new Date(new Date(day.date).getTime() + nights * 86_400_000).toISOString().slice(0, 10) : null;

          scored.push({ origin: route.origin, destination: route.destination, departureDate: day.date, returnDate, nights, score });
        }
      }

      const rankedCandidates = sortByPriority(scored);
      deepSearchQueue = rankedCandidates.slice(0, strategy.deepSearchBudget);
      if (rankedCandidates.length > strategy.deepSearchBudget) budgetExhausted = true;
    } else {
      // Provider has no calendar endpoint — no cheaper alternative exists,
      // so the whole budget goes to a representative sample of exact
      // searches (same sampling as v1, just capped by the request budget
      // instead of running unbounded).
      const allCombinations = buildCombinations(search);
      deepSearchQueue = allCombinations.slice(0, strategy.deepSearchBudget);
      if (allCombinations.length > strategy.deepSearchBudget) budgetExhausted = true;
    }

    // ---- Nivel 2 — Profundización -----------------------------------------
    for (const combo of deepSearchQueue) {
      if (!canSpend()) break;
      const flights = await fetchExactCached(combo);
      combinationsAnalyzed++;
      allResults.push(...flights);
      if (abortRun) break;
    }

    // ---- Apply the "strict" schedule constraint before scoring/alerting ---
    const eligibleResults = filterByStrictSchedule(allResults, search.schedule);

    await repo.saveFlightResults(allResults); // raw data is always kept, even outside a strict schedule window
    await repo.appendPriceHistory(allResults.map(buildMarketObservation));

    const statsCache = new Map<string, HistoricalStats>();
    async function statsFor(origin: string, destination: string): Promise<HistoricalStats> {
      const key = `${origin}-${destination}`;
      if (!statsCache.has(key)) {
        const history = await repo.getPriceHistory(origin, destination, 90);
        statsCache.set(key, computeHistoricalStats(history));
      }
      return statsCache.get(key)!;
    }

    const notificationSettings = await repo.getNotificationSettings(search.id);

    let opportunitiesFound = 0;
    let alertsSent = 0;
    let bestFlight: FlightResult | null = null;
    let bestOpportunity: OpportunityEvaluation | null = null;

    for (const flight of eligibleResults) {
      if (referenceUnitPrice(flight) > search.maxPrice) continue;

      const stats = await statsFor(flight.origin, flight.destination);
      const evaluation = evaluateOpportunity({
        flight,
        targetPrice: search.targetPrice,
        maxPrice: search.maxPrice,
        historicalStats: stats,
        previousBestPrice: stats.min,
      });

      if (!bestFlight || flight.price.effectivePrice < bestFlight.price.effectivePrice) {
        bestFlight = flight;
        bestOpportunity = evaluation;
      }

      const isOpp = evaluation.level !== "NORMAL" && evaluation.level !== "ALTO";
      if (isOpp) opportunitiesFound++;

      const alert = await processAlert(repo, { flight, evaluation, averagePrice: stats.average }, notificationSettings);
      if (alert && alert.status === "sent") alertsSent++;
    }

    const finishedAt = new Date();
    const runStatus: "success" | "error" = abortRun && allResults.length === 0 ? "error" : "success";
    const runErrorMessage = abortRun ? `Corrida detenida (${abortCode}): ${abortMessage}` : null;

    await repo.createSearchRun({
      id: runId,
      searchId: search.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      combinationsAnalyzed,
      flightsFound: allResults.length,
      opportunitiesFound,
      alertsSent,
      status: runStatus,
      errorMessage: runErrorMessage,
      requestsUsed,
      cacheHits,
      errorsByCode,
      budgetExhausted,
    });

    await repo.updateSearch(search.id, {
      lastRunAt: finishedAt.toISOString(),
      nextRunAt: computeNextRunAt(search, finishedAt).toISOString(),
      lastError: runErrorMessage,
      status: abortCode === "AUTHENTICATION" ? "error" : "active",
    });

    return {
      runId,
      combinationsAnalyzed,
      flightsFound: allResults.length,
      opportunitiesFound,
      alertsSent,
      requestsUsed,
      cacheHits,
      budgetExhausted,
      bestFlight,
      bestOpportunity,
      status: runStatus,
      errorMessage: runErrorMessage,
    };
  } catch (err) {
    const finishedAt = new Date();
    const message = err instanceof Error ? err.message : "Error desconocido durante la búsqueda";

    await repo.createSearchRun({
      id: runId,
      searchId: search.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      combinationsAnalyzed,
      flightsFound: 0,
      opportunitiesFound: 0,
      alertsSent: 0,
      status: "error",
      errorMessage: message,
      requestsUsed,
      cacheHits,
      errorsByCode,
      budgetExhausted,
    });

    await repo.updateSearch(search.id, {
      lastRunAt: finishedAt.toISOString(),
      lastError: message,
      status: "error",
    });

    return {
      runId,
      combinationsAnalyzed,
      flightsFound: 0,
      opportunitiesFound: 0,
      alertsSent: 0,
      requestsUsed,
      cacheHits,
      budgetExhausted,
      bestFlight: null,
      bestOpportunity: null,
      status: "error",
      errorMessage: message,
    };
  }
}
