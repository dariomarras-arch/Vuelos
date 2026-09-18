// ---------------------------------------------------------------------------
// FlightSearchProvider — abstract contract for any flight data source.
//
// This is the seam the whole application is built around. Nothing outside
// this folder should know whether flight data comes from mock data, Duffel,
// SerpApi, or anything else. To add a real provider: implement this
// interface in a new file (e.g. `DuffelFlightProvider.ts`) and register it
// in `index.ts`. No other part of the app needs to change.
//
// v2: every method should throw `ProviderError` (see ./errors.ts) rather
// than a bare Error — the engine's per-combination error handling
// (engine/runSearch.ts) switches on `ProviderError.code` to decide whether
// to retry, skip, or abort the whole run. A provider that throws something
// else still works (the engine normalizes it via `toProviderError`), it
// just gets treated as UNKNOWN (never retried).
// ---------------------------------------------------------------------------

import {
  BaggageOption,
  CalendarDayPrice,
  CurrencyCode,
  FlightPriceHistoryEntry,
  FlightResult,
  IATACode,
  PassengerConfig,
  ProviderCapabilities,
  ProviderId,
  ProviderRateLimit,
  TripType,
} from "@/lib/types";

export interface FlightSearchQuery {
  origin: IATACode;
  destination: IATACode;
  departureDate: string; // ISO date
  returnDate: string | null; // null for one-way
  tripType: TripType;
  passengers: PassengerConfig;
  maxStops: 0 | 1 | 2;
  currency: CurrencyCode;
  /** Search run this query belongs to — used only for correlating results. */
  searchId: string;
  searchRunId: string;
}

export interface PriceCalendarQuery {
  origin: IATACode;
  destination: IATACode;
  dateFrom: string;
  dateTo: string;
  tripType: TripType;
  nights: number | null; // representative trip length for round trips
  currency: CurrencyCode;
}

export interface PriceHistoryQuery {
  origin: IATACode;
  destination: IATACode;
  daysBack: number;
  currency: CurrencyCode;
}

/**
 * Abstract flight data source. Every provider (mock or real) must implement
 * these four operations plus declare its own capabilities/rate limit.
 * Methods return `null`/empty arrays rather than throwing when data simply
 * isn't available — callers decide how to present "not reported" data, the
 * provider never fabricates it. Use `ProviderError` for actual failures
 * (rate limited, timeout, invalid route, auth, quota) so the engine can
 * react appropriately per error code.
 */
export interface FlightSearchProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly isMock: boolean;
  readonly capabilities: ProviderCapabilities;
  readonly rateLimit: ProviderRateLimit;

  /** Search concrete itineraries for one origin/destination/date combination. This is the expensive, exact-search call — reserve it for the deep-search phase. */
  searchFlights(query: FlightSearchQuery): Promise<FlightResult[]>;

  /** Fetch full details for a previously returned flight result. May return null if the offer expired — real providers don't let you re-fetch an expired offer by id. */
  getFlightDetails(flightResultId: string): Promise<FlightResult | null>;

  /** Cheapest representative price per departure date across a range — the cheap, wide exploration-phase call. Providers that don't support this should set capabilities.supportsPriceCalendar = false and return []. */
  getPriceCalendar(query: PriceCalendarQuery): Promise<CalendarDayPrice[]>;

  /**
   * Provider-side historical price insight (if the provider exposes one).
   * Used only to bootstrap the local `flight_price_history` table when it is
   * still empty — the application's own history, accumulated from real
   * search runs, is always preferred once it exists.
   */
  getPriceHistory(query: PriceHistoryQuery): Promise<FlightPriceHistoryEntry[]>;
}

// Re-exported here so provider implementations only need one import path.
export type { BaggageOption };
