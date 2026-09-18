// ---------------------------------------------------------------------------
// runSearch — the core "search engine" orchestrator (spec section 6).
//
// For a given FlightSearch it:
//   1. Expands the configuration into a bounded set of concrete combinations
//      (routes × dates × durations) — see combinations.ts.
//   2. Queries the active FlightSearchProvider for each combination (each
//      call itself returns several itineraries at different times/airlines/
//      stops, so the schedule dimension is covered without assuming any
//      slot is "always cheaper").
//   3. Persists every result to `flight_results` and `flight_price_history`.
//   4. Computes historical stats per route and evaluates the Opportunity
//      Score for every flight found.
//   5. Runs the alert engine (with deduplication) for qualifying flights.
//   6. Records a SearchRun log entry and updates the search's schedule.
//
// This function is called both by the manual "run now" API route and by the
// cron endpoint that the Vercel Scheduler / external cron hits periodically.
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto";
import { getActiveProvider } from "@/lib/providers";
import { getRepository } from "@/lib/data";
import { buildCombinations } from "./combinations";
import { computeHistoricalStats } from "@/lib/analytics/stats";
import { evaluateOpportunity } from "@/lib/analytics/opportunity";
import { processAlert } from "@/lib/alerts/engine";
import { computeNextRunAt } from "@/lib/scheduler/frequency";
import {
  FlightPriceHistoryEntry,
  FlightResult,
  HistoricalStats,
  OpportunityEvaluation,
} from "@/lib/types";

export interface RunSearchResult {
  runId: string;
  combinationsAnalyzed: number;
  flightsFound: number;
  opportunitiesFound: number;
  alertsSent: number;
  bestFlight: FlightResult | null;
  bestOpportunity: OpportunityEvaluation | null;
  status: "success" | "error";
  errorMessage: string | null;
}

function resultToHistoryEntry(flight: FlightResult): FlightPriceHistoryEntry {
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
    baggage: flight.baggageOption,
    basePrice: flight.price.basePrice,
    fees: flight.price.fees,
    baggageCost: flight.price.baggageCost,
    effectivePrice: flight.price.effectivePrice,
    currency: flight.price.currency,
    source: flight.source,
    bookingUrl: flight.bookingUrl,
  };
}

export async function runSearch(searchId: string): Promise<RunSearchResult> {
  const repo = getRepository();
  const provider = getActiveProvider();
  const startedAt = new Date();
  const runId = randomUUID();

  const search = await repo.getSearch(searchId);
  if (!search) {
    throw new Error(`Búsqueda ${searchId} no encontrada`);
  }

  try {
    const combos = buildCombinations(search);
    const allResults: FlightResult[] = [];

    for (const combo of combos) {
      const flights = await provider.searchFlights({
        origin: combo.origin,
        destination: combo.destination,
        departureDate: combo.departureDate,
        returnDate: combo.returnDate,
        tripType: search.tripType,
        adults: search.passengers.adults,
        children: search.passengers.children,
        baggage: search.baggage,
        maxStops: search.maxStops,
        currency: search.currency,
        searchId: search.id,
        searchRunId: runId,
      });
      allResults.push(...flights);
    }

    await repo.saveFlightResults(allResults);
    await repo.appendPriceHistory(allResults.map(resultToHistoryEntry));

    // Historical stats are computed per unique route, cached for this run.
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
    const passengers = search.passengers.adults + search.passengers.children;

    let opportunitiesFound = 0;
    let alertsSent = 0;
    let bestFlight: FlightResult | null = null;
    let bestOpportunity: OpportunityEvaluation | null = null;

    for (const flight of allResults) {
      if (flight.price.effectivePrice > search.maxPrice) continue; // outside the user's ceiling — not a candidate

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

      const alert = await processAlert(
        repo,
        { flight, evaluation, passengers, averagePrice: stats.average },
        notificationSettings,
      );
      if (alert && alert.status === "sent") alertsSent++;
    }

    const finishedAt = new Date();
    await repo.createSearchRun({
      id: runId,
      searchId: search.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      combinationsAnalyzed: combos.length,
      flightsFound: allResults.length,
      opportunitiesFound,
      alertsSent,
      status: "success",
      errorMessage: null,
    });

    await repo.updateSearch(search.id, {
      lastRunAt: finishedAt.toISOString(),
      nextRunAt: computeNextRunAt(search, finishedAt).toISOString(),
      lastError: null,
      status: "active",
    });

    return {
      runId,
      combinationsAnalyzed: combos.length,
      flightsFound: allResults.length,
      opportunitiesFound,
      alertsSent,
      bestFlight,
      bestOpportunity,
      status: "success",
      errorMessage: null,
    };
  } catch (err) {
    const finishedAt = new Date();
    const message = err instanceof Error ? err.message : "Error desconocido durante la búsqueda";

    await repo.createSearchRun({
      id: runId,
      searchId: search.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      combinationsAnalyzed: 0,
      flightsFound: 0,
      opportunitiesFound: 0,
      alertsSent: 0,
      status: "error",
      errorMessage: message,
    });

    await repo.updateSearch(search.id, {
      lastRunAt: finishedAt.toISOString(),
      lastError: message,
      status: "error",
    });

    return {
      runId,
      combinationsAnalyzed: 0,
      flightsFound: 0,
      opportunitiesFound: 0,
      alertsSent: 0,
      bestFlight: null,
      bestOpportunity: null,
      status: "error",
      errorMessage: message,
    };
  }
}
