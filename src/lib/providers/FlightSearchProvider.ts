// ---------------------------------------------------------------------------
// FlightSearchProvider — abstract contract for any flight data source.
//
// This is the seam the whole application is built around. Nothing outside
// this folder should know whether flight data comes from mock data, Amadeus,
// a Google-Flights-compatible scraper, or anything else. To add a real
// provider: implement this interface in a new file (e.g.
// `AmadeusFlightProvider.ts`) and register it in `index.ts`. No other part
// of the app needs to change.
// ---------------------------------------------------------------------------

import {
  BaggageOption,
  CalendarDayPrice,
  CurrencyCode,
  FlightPriceHistoryEntry,
  FlightResult,
  IATACode,
  ProviderId,
  TripType,
} from "@/lib/types";

export interface FlightSearchQuery {
  origin: IATACode;
  destination: IATACode;
  departureDate: string; // ISO date
  returnDate: string | null; // null for one-way
  tripType: TripType;
  adults: number;
  children: number;
  baggage: BaggageOption;
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
 * these four operations. Methods return `null`/empty arrays rather than
 * throwing when data simply isn't available — callers decide how to present
 * "not reported" data, the provider never fabricates it.
 */
export interface FlightSearchProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly isMock: boolean;

  /** Search concrete itineraries for one origin/destination/date combination. */
  searchFlights(query: FlightSearchQuery): Promise<FlightResult[]>;

  /** Fetch full details for a previously returned flight result. */
  getFlightDetails(flightResultId: string): Promise<FlightResult | null>;

  /** Cheapest representative price per departure date across a range. */
  getPriceCalendar(query: PriceCalendarQuery): Promise<CalendarDayPrice[]>;

  /**
   * Provider-side historical price insight (if the provider exposes one).
   * Used only to bootstrap the local `flight_price_history` table when it is
   * still empty — the application's own history, accumulated from real
   * search runs, is always preferred once it exists.
   */
  getPriceHistory(query: PriceHistoryQuery): Promise<FlightPriceHistoryEntry[]>;
}
