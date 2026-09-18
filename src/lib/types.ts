// ---------------------------------------------------------------------------
// FLIGHT HUNTER — Domain model
// ---------------------------------------------------------------------------
// This file is the single source of truth for the shapes used across the
// provider layer, the repository layer, the analytics engine and the UI.
// Keeping them independent of any specific flight API or database makes it
// possible to swap MockFlightProvider for a real one (Amadeus, etc.) or the
// in-memory repository for Supabase without touching the rest of the app.

export type IATACode = string;

export type TripType = "round_trip" | "one_way";

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
// Flight search configuration (what the user configures)
// ---------------------------------------------------------------------------

export interface SchedulePreference {
  mode: "any" | "preferred";
  departurePreferredSlots?: TimeSlotKey[];
  returnPreferredSlots?: TimeSlotKey[];
}

export interface PassengerConfig {
  adults: number;
  children: number;
}

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
  baggage: BaggageOption;
  maxStops: 0 | 1 | 2;

  targetPrice: number;
  maxPrice: number;
  currency: CurrencyCode;

  schedule: SchedulePreference;

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
}

// ---------------------------------------------------------------------------
// Price breakdown — never invent a component; mark as "not reported" (null)
// when the provider did not return it.
// ---------------------------------------------------------------------------

export interface PriceBreakdown {
  basePrice: number;
  fees: number | null;
  baggageCost: number | null;
  otherCharges: number | null;
  effectivePrice: number; // basePrice + known components; null components excluded, not invented
  currency: CurrencyCode;
}

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

  baggageIncluded: boolean;
  baggageOption: BaggageOption;

  price: PriceBreakdown;

  source: string; // provider id, e.g. "mock", "amadeus"
  bookingUrl: string;

  foundAt: string; // ISO timestamp
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
  baggage: BaggageOption;
  basePrice: number;
  fees: number | null;
  baggageCost: number | null;
  effectivePrice: number;
  currency: CurrencyCode;
  source: string;
  bookingUrl: string;
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

  pricePerPax: number;
  totalPrice: number;
  passengers: number;
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
// Provider configuration
// ---------------------------------------------------------------------------

export type ProviderId = "mock" | "amadeus" | "custom";

export interface ProviderConfig {
  activeProvider: ProviderId;
  available: { id: ProviderId; label: string; configured: boolean }[];
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
