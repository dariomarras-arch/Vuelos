// ---------------------------------------------------------------------------
// FLIGHT HUNTER — Domain model
// ---------------------------------------------------------------------------
// This file is the single source of truth for the shapes used across the
// provider layer, the repository layer, the analytics engine and the UI.
// Keeping them independent of any specific flight API or database makes it
// possible to swap MockFlightProvider for a real one (Duffel, SerpApi, etc.)
// or the in-memory repository for Supabase without touching the rest of the
// app.
//
// v2 note (search-engine efficiency rework): this file was reshaped around
// three findings from the provider audit — (1) fares are priced per
// passenger type, not per head; (2) baggage is an attribute of the returned
// offer, not a search filter; (3) booking is either a deep link or an
// API-order flow, never uniformly a URL. See README "Arquitectura v2" for
// the full rationale.

export type IATACode = string;

export type TripType = "round_trip" | "one_way";

// What the USER asks for. This used to double as a provider search filter;
// it no longer does — see BaggageAllowance for what a provider actually
// returns, and engine/filters.ts for how baggageRequirement is now applied
// as a post-search filter instead.
export type BaggageOption =
  | "none"
  | "carry_on"
  | "checked_1"
  | "checked_multiple";

export type CurrencyCode = "USD" | "ARS";

export type TimeSlotKey = "00-04" | "04-08" | "08-12" | "12-16" | "16-20" | "20-24";

export const TIME_SLOTS: TimeSlotKey[] = ["00-04", "04-08", "08-12", "12-16", "16-20", "20-24"];

export const FLEXIBILITY_OPTIONS = [0, 1, 2, 3, 5, 7] as const;
export type FlexibilityDays = (typeof FLEXIBILITY_OPTIONS)[number];

export const MAX_STOPS_OPTIONS = [0, 1, 2] as const;

export const CACHE_TTL_OPTIONS = [6, 12, 24] as const;
export type CacheTtlHours = (typeof CACHE_TTL_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Airports & alternative airport groups
// ---------------------------------------------------------------------------

export interface Airport {
  iata: IATACode;
  name: string;
  city: string;
  country: string;
  groupId?: string; // links to an AirportGroup for "nearby airports" logic
}

export interface AirportGroup {
  id: string;
  label: string;
  airports: IATACode[];
}

// ---------------------------------------------------------------------------
// Airlines
// ---------------------------------------------------------------------------

export interface Airline {
  code: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Passengers — adults + one age per child (ages drive real fare rules;
// a bare headcount does not).
// ---------------------------------------------------------------------------

export interface PassengerConfig {
  adults: number;
  childrenAges: number[]; // e.g. [10, 6, 4] — one entry per child, in years
}

export function passengerCount(p: PassengerConfig): number {
  return p.adults + p.childrenAges.length;
}

/**
 * The per-adult-equivalent price used for every threshold/historical
 * comparison (target price, historical average/min, Opportunity Score).
 * `targetPrice`/`maxPrice` and the historical stats are all expressed on
 * this same per-passenger basis — matching how the product spec's own
 * examples read ("Precio objetivo: USD 750" for one adult, separate from
 * "Total estimado: USD 3.675" for the whole party). `PriceBreakdown.
 * effectivePrice` stays the PARTY TOTAL for display/booking purposes; this
 * is the other, comparison-oriented unit, derived from the real adult fare
 * when the provider reported one, or — only when it didn't — a plain
 * division of the known total by headcount (never a fabricated fare).
 */
export function referenceUnitPrice(flight: { price: Pick<PriceBreakdown, "passengers" | "effectivePrice">; passengers: PassengerConfig }): number {
  if (flight.price.passengers.adultPrice !== null) return flight.price.passengers.adultPrice;
  return flight.price.effectivePrice / passengerCount(flight.passengers);
}

// ---------------------------------------------------------------------------
// Schedule preference — "any" ignores schedule entirely (today's default),
// "preferred" biases exploration priority toward the chosen slots without
// excluding others, "strict" filters results down to only those slots.
// ---------------------------------------------------------------------------

export type ScheduleMode = "any" | "preferred" | "strict";

export interface SchedulePreference {
  mode: ScheduleMode;
  departurePreferredSlots?: TimeSlotKey[];
  returnPreferredSlots?: TimeSlotKey[];
}

// ---------------------------------------------------------------------------
// Request budget — caps how many provider requests a single run (and a
// single day) may spend. Enforced by the engine, never exceeded.
// ---------------------------------------------------------------------------

export interface RequestBudget {
  maxRequestsPerRun: number; // default 100
  maxRequestsPerDay: number; // default 300
}

export const DEFAULT_REQUEST_BUDGET: RequestBudget = {
  maxRequestsPerRun: 100,
  maxRequestsPerDay: 300,
};

// ---------------------------------------------------------------------------
// Flight search configuration (what the user configures)
// ---------------------------------------------------------------------------

export type SearchStatus = "active" | "paused" | "error";

export interface FlightSearch {
  id: string;
  userId: string;
  name: string;

  origins: IATACode[];
  destinations: IATACode[];
  allowNearbyAirports: boolean;

  tripType: TripType;
  dateFrom: string; // ISO date, start of the departure window
  dateTo: string; // ISO date, end of the departure window
  minNights: number;
  maxNights: number;
  flexibilityDays: FlexibilityDays;

  passengers: PassengerConfig;
  baggageRequirement: BaggageOption; // what the user wants — filtered post-search, not sent as a query param
  maxStops: 0 | 1 | 2;

  targetPrice: number;
  maxPrice: number;
  currency: CurrencyCode;

  schedule: SchedulePreference;

  requestBudget: RequestBudget;
  cacheTtlHours: CacheTtlHours;

  status: SearchStatus;
  createdAt: string;
  updatedAt: string;

  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}

export type NewFlightSearch = Omit<
  FlightSearch,
  "id" | "userId" | "createdAt" | "updatedAt" | "lastRunAt" | "nextRunAt" | "lastError" | "status"
> & { status?: SearchStatus };

// ---------------------------------------------------------------------------
// Search execution ("cron run") — one row per time the engine analyzes a
// search across its combinations of dates/durations/times/airports.
// ---------------------------------------------------------------------------

export interface SearchRun {
  id: string;
  searchId: string;
  startedAt: string;
  finishedAt: string;
  combinationsAnalyzed: number;
  flightsFound: number;
  opportunitiesFound: number;
  alertsSent: number;
  status: "success" | "error";
  errorMessage: string | null;

  // v2: request-efficiency telemetry for this run
  requestsUsed: number;
  cacheHits: number;
  errorsByCode: Partial<Record<ProviderErrorCode, number>>;
  budgetExhausted: boolean;
}

// ---------------------------------------------------------------------------
// Provider error taxonomy
// ---------------------------------------------------------------------------

export type ProviderErrorCode =
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "INVALID_ROUTE"
  | "AUTHENTICATION"
  | "QUOTA_EXCEEDED"
  | "PROVIDER_ERROR"
  | "UNKNOWN";

// ---------------------------------------------------------------------------
// Price breakdown — never invent a component; mark as "not reported" (null)
// when the provider did not return it.
// ---------------------------------------------------------------------------

/**
 * Per-passenger-type pricing. `totalPrice` is always a real number — either
 * the sum of known unit prices (adult/child), or the provider's own lump
 * total when it doesn't break fares down by passenger type
 * (`pricingBreakdownAvailable: false`). We never fabricate a per-passenger
 * split that the provider didn't give us.
 */
export interface PassengerPriceBreakdown {
  pricingBreakdownAvailable: boolean;
  adultPrice: number | null; // price for ONE adult
  childPrices: (number | null)[]; // aligned with PassengerConfig.childrenAges, one entry per child
  totalPrice: number; // sum(adultPrice * adults) + sum(childPrices) when available, else the provider's total
  currency: CurrencyCode;
}

export interface PriceBreakdown {
  passengers: PassengerPriceBreakdown;
  fees: number | null;
  baggageCost: number | null;
  otherCharges: number | null;
  // effectivePrice = passengers.totalPrice + known fees/baggageCost/otherCharges.
  // This is the TOTAL price for the whole party as configured on the search —
  // comparisons (opportunity score, history, dedup) are all done in this
  // unit. See README "Arquitectura v2" for why this replaces the old
  // "flat per-head" price model.
  effectivePrice: number;
  currency: CurrencyCode;
}

// ---------------------------------------------------------------------------
// Baggage — an attribute of the OFFER, never a search parameter. Any field
// the provider doesn't report stays null ("no informado"), never assumed.
// ---------------------------------------------------------------------------

export interface BaggageAllowance {
  included: boolean | null;
  checkedBags: number | null;
  carryOnIncluded: boolean | null;
  addCost: number | null; // cost to add checked baggage, if known and not included
}

// ---------------------------------------------------------------------------
// Booking — not every provider gives a redirect URL. Some are API-order
// flows (Duffel/Amadeus-style), some only give a generic search link, and
// some give nothing usable at all.
// ---------------------------------------------------------------------------

export type BookingInfo =
  | { type: "deep_link"; url: string }
  | { type: "api_order"; offerId: string }
  | { type: "search_link"; url: string }
  | { type: "unavailable" };

// ---------------------------------------------------------------------------
// A single flight leg (one direction)
// ---------------------------------------------------------------------------

export interface FlightLeg {
  originAirport: IATACode;
  destinationAirport: IATACode;
  departureDateTime: string; // ISO datetime
  arrivalDateTime: string; // ISO datetime
  departureTimeSlot: TimeSlotKey;
  durationMinutes: number;
  stops: number;
  stopAirports: IATACode[];
  airline: string; // airline code
  flightNumber: string;
}

// ---------------------------------------------------------------------------
// Flight result — an itinerary (outbound + optional inbound leg) found by
// a provider for a given search combination.
// ---------------------------------------------------------------------------

export interface FlightResult {
  id: string;
  searchId: string;
  searchRunId: string;

  origin: IATACode;
  destination: IATACode;

  outbound: FlightLeg;
  inbound: FlightLeg | null; // null for one-way

  passengers: PassengerConfig; // the party this price applies to
  baggage: BaggageAllowance;

  price: PriceBreakdown;

  source: string; // provider id, e.g. "mock", "duffel"
  booking: BookingInfo;
  expiresAt: string | null; // offers are ephemeral; null = provider gave no expiry (assume still stale-checked by TTL)

  foundAt: string; // ISO timestamp
}

export function isOfferExpired(flight: Pick<FlightResult, "expiresAt">, now: Date = new Date()): boolean {
  if (!flight.expiresAt) return false;
  return new Date(flight.expiresAt).getTime() < now.getTime();
}

// ---------------------------------------------------------------------------
// MarketObservation — the atomic unit of "the app learning from the
// market". In this codebase it is persisted as a FlightPriceHistoryEntry
// (see engine/runSearch.ts buildMarketObservation) rather than a separate
// table, to avoid maintaining two parallel historical stores of the same
// fact — see README for the rationale. Kept as its own named type so call
// sites that only care about "an observed market data point" don't need to
// import the history-table-shaped type.
// ---------------------------------------------------------------------------

export interface MarketObservation {
  route: { origin: IATACode; destination: IATACode };
  departureDate: string;
  departureTime: string;
  timeSlot: TimeSlotKey;
  airline: string;
  price: number; // effectivePrice, for the party size that produced this observation
  currency: CurrencyCode;
  stops: number;
  baggageIncluded: boolean | null;
  durationMinutes: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Historical price record — persisted permanently (flight_price_history)
// ---------------------------------------------------------------------------

export interface FlightPriceHistoryEntry {
  id: string;
  timestamp: string;
  searchId: string;
  origin: IATACode;
  destination: IATACode;
  departureDate: string;
  returnDate: string | null;
  airline: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  returnTime: string | null;
  stops: number;
  durationMinutes: number;
  baggage: BaggageAllowance;
  passengers: PassengerConfig;
  pricingBreakdownAvailable: boolean;
  // Per-adult-equivalent reference price (see referenceUnitPrice()) — NOT
  // the party total. History/HistoricalStats/the Opportunity Engine all
  // compare on this per-passenger basis, matching targetPrice/maxPrice.
  // The party total for the flight that produced this row lives on
  // FlightResult.price.effectivePrice instead.
  effectivePrice: number;
  currency: CurrencyCode;
  source: string;
  bookingUrl: string | null; // only when booking.type has a url; kept simple for the flat history table
}

// ---------------------------------------------------------------------------
// Historical statistics computed from FlightPriceHistoryEntry[]
// ---------------------------------------------------------------------------

export interface HistoricalStats {
  count: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  p10: number | null;
  p25: number | null;
  last7d: number | null;
  last30d: number | null;
  last90d: number | null;
}

// ---------------------------------------------------------------------------
// Price position — purely descriptive placement of a current price against
// the historical distribution. Distinct from the Opportunity Score (which
// also folds in rules like target price / baggage / stops); this is just
// "where does this number sit statistically".
// ---------------------------------------------------------------------------

export interface PricePosition {
  current: number;
  min: number | null;
  p10: number | null;
  p25: number | null;
  median: number | null;
  average: number | null;
  description: string; // data-grounded only; "Histórico insuficiente" when count is too low
}

// ---------------------------------------------------------------------------
// Opportunity scoring — descriptive, never prescriptive
// ---------------------------------------------------------------------------

export type OpportunityLevel =
  | "EXCEPCIONAL"
  | "MUY_INTERESANTE"
  | "INTERESANTE"
  | "NORMAL"
  | "ALTO";

export type RuleId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface RuleEvaluation {
  id: RuleId;
  label: string;
  passed: boolean;
  detail: string;
}

export interface OpportunityEvaluation {
  flightResultId: string;
  level: OpportunityLevel;
  score: number; // 0-100 descriptive index, not a purchase recommendation
  vsTarget: number | null; // % difference vs target price
  vsAverage: number | null; // % difference vs historical average
  vsMin: number | null; // % difference vs historical min
  rules: RuleEvaluation[];
  passedRuleIds: RuleId[];
  explanation: string; // rule-based natural language, data-grounded only
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AlertStatus = "sent" | "suppressed_duplicate" | "pending";

export interface Alert {
  id: string;
  searchId: string;
  flightResultId: string;
  createdAt: string;

  origin: IATACode;
  destination: IATACode;
  departureDate: string;
  returnDate: string | null;

  passengers: PassengerConfig;
  totalPrice: number; // = flight.price.effectivePrice, for the whole party
  pricingBreakdownAvailable: boolean;
  adultPrice: number | null;
  childPrices: (number | null)[];
  currency: CurrencyCode;

  averagePrice: number | null;
  variationPercent: number | null;

  level: OpportunityLevel;
  passedRuleIds: RuleId[];
  reasonSummary: string;
  message: string;

  status: AlertStatus;
  dedupeKey: string;
}

// ---------------------------------------------------------------------------
// Notification settings
// ---------------------------------------------------------------------------

export type NotificationChannel = "telegram" | "whatsapp" | "email";

export interface NotificationSetting {
  id: string;
  searchId: string;
  channel: NotificationChannel;
  enabled: boolean;
  minimumPrice: number | null;
  minimumDropPercent: number | null;
  exceptionalOnly: boolean;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export interface SchedulerBucket {
  id: string;
  label: string;
  daysToDepartureMin: number;
  daysToDepartureMax: number | null;
  runsPerDay: number;
}

// ---------------------------------------------------------------------------
// Provider configuration & capabilities
// ---------------------------------------------------------------------------

export type ProviderId = "mock" | "duffel" | "serpapi" | "custom";

export interface ProviderConfig {
  activeProvider: ProviderId;
  available: { id: ProviderId; label: string; configured: boolean }[];
}

/**
 * What a provider can actually do. The engine uses this to decide its
 * search strategy — e.g. skip the cheap calendar-based exploration phase
 * and fall back to sampled exact searches when supportsPriceCalendar is
 * false. Every real provider declares this once, honestly (no capability
 * should ever be claimed true "just in case").
 */
export interface ProviderCapabilities {
  supportsPriceCalendar: boolean;
  supportsFlexibleDates: boolean;
  supportsMultipleAirports: boolean;
  supportsExactFlightSearch: boolean;
  supportsBookingLinks: boolean;
  supportsPassengerPricing: boolean;
}

/** Provider-declared limits — the engine's RateLimiter is configured from this, never from an assumption. */
export interface ProviderRateLimit {
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  requestsPerDay?: number;
}

// ---------------------------------------------------------------------------
// Price calendar (provider abstraction output)
// ---------------------------------------------------------------------------

export interface CalendarDayPrice {
  date: string;
  price: number | null;
  currency: CurrencyCode;
}

// ---------------------------------------------------------------------------
// Request log — one row per attempted provider call (cache hit, success or
// error). Backs the request budget, the dedup/cache-hit stats and the API
// Usage dashboard from a single source of truth.
// ---------------------------------------------------------------------------

export type RequestLogOutcome = "success" | "error" | "cache_hit";
export type RequestLogEndpoint = "searchFlights" | "getPriceCalendar" | "getFlightDetails" | "getPriceHistory";

export interface RequestLogEntry {
  id: string;
  searchId: string;
  searchRunId: string | null;
  timestamp: string;
  endpoint: RequestLogEndpoint;
  outcome: RequestLogOutcome;
  errorCode: ProviderErrorCode | null;
  cacheKey: string | null;
}

export interface ApiUsageSummary {
  requestsToday: number;
  limitToday: number;
  requestsLastRun: number;
  limitPerRun: number;
  errors: number;
  rateLimited: number;
  cacheHits: number;
  cacheMisses: number;
}

// ---------------------------------------------------------------------------
// Provider cache — dedup layer keyed by a canonical query signature.
// ---------------------------------------------------------------------------

export interface ProviderCacheEntry {
  key: string;
  endpoint: RequestLogEndpoint;
  payload: unknown; // FlightResult[] | CalendarDayPrice[] | FlightPriceHistoryEntry[] | FlightResult, depending on endpoint
  createdAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Derived analytics view models used by UI
// ---------------------------------------------------------------------------

export interface DateOption {
  departureDate: string;
  returnDate: string | null;
  nights: number | null;
  price: number;
  currency: CurrencyCode;
}

export interface TimeSlotStat {
  slot: TimeSlotKey;
  averagePrice: number | null;
  flightCount: number;
}

export interface BestCombination {
  flightResult: FlightResult;
  opportunity: OpportunityEvaluation;
}

// ---------------------------------------------------------------------------
// Search strategy — the exploration vs. deep-search phases (spec §1-2)
// ---------------------------------------------------------------------------

export type SearchPhase = "exploration" | "deep_search";

export type PriorityTier = "high" | "medium" | "low";

export interface PriorityCandidate {
  origin: IATACode;
  destination: IATACode;
  departureDate: string;
  returnDate: string | null;
  nights: number | null;
  tier: PriorityTier;
  score: number; // higher = explored first
  reasons: string[]; // human-readable, data-grounded ("cerca del mínimo histórico", ...)
}
