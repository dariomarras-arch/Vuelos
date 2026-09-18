// ---------------------------------------------------------------------------
// MockFlightProvider — deterministic simulated flight data source.
//
// Used whenever no real provider is configured (the default out of the box).
// Every price is clearly synthetic and the rest of the app is responsible
// for labelling it as such ("MODO DEMO — DATOS SIMULADOS"); this file never
// pretends to be a real market.
//
// v2: now simulates the things a real integration will actually have to
// deal with — differentiated adult/child pricing, baggage as an offer
// attribute, ephemeral offers, and occasional provider errors — all
// configurable via `mockFlightProvider.configure(...)` so tests (and the
// running app) can exercise both the happy path and the failure paths on
// demand. Defaults are reliable (errorRate 0) so seeding/demo mode never
// flakes.
// ---------------------------------------------------------------------------

import { addDays, differenceInCalendarDays, formatISO, parseISO } from "date-fns";
import {
  FlightSearchProvider,
  FlightSearchQuery,
  PriceCalendarQuery,
  PriceHistoryQuery,
} from "./FlightSearchProvider";
import { ProviderError } from "./errors";
import {
  AIRLINES,
  childFareFactor,
  dayEpoch,
  flightNumberFor,
  generateBaggageAllowance,
  pickAirline,
  rngFor,
  routeBasePrice,
  slotPriceFactor,
  timeSlotOf,
} from "./mockData";
import {
  BookingInfo,
  CalendarDayPrice,
  FlightLeg,
  FlightPriceHistoryEntry,
  FlightResult,
  PassengerConfig,
  PassengerPriceBreakdown,
  PriceBreakdown,
  ProviderCapabilities,
  ProviderErrorCode,
  ProviderRateLimit,
} from "@/lib/types";

const STOP_DURATION_PENALTY_MIN = 95; // extra minutes per connection
const BASE_DURATION_MIN = 240; // baseline nonstop-ish duration for reference routes

// Realistic-ish distribution of *which* error fires when a simulated error
// is triggered — weighted toward the transient ones, same as a real API.
const ERROR_CODE_WEIGHTS: [ProviderErrorCode, number][] = [
  ["RATE_LIMITED", 0.35],
  ["TIMEOUT", 0.3],
  ["PROVIDER_ERROR", 0.2],
  ["INVALID_ROUTE", 0.1],
  ["UNKNOWN", 0.05],
];

export interface MockProviderConfig {
  /** Probability [0,1] that any given searchFlights() call throws a simulated ProviderError. 0 by default so demo/seed data stays reliable. */
  errorRate: number;
  /** When set, every simulated error uses this exact code instead of the weighted random pick — lets tests exercise one specific failure path deterministically. */
  forceErrorCode: ProviderErrorCode | null;
  rateLimit: ProviderRateLimit;
}

const DEFAULT_CONFIG: MockProviderConfig = {
  errorRate: 0,
  forceErrorCode: null,
  rateLimit: { requestsPerSecond: 8, requestsPerMinute: 200, requestsPerDay: 5000 },
};

function advanceFactor(daysUntilDeparture: number): number {
  // Very close (<7d) or very far (>300d) tends to be pricier; a broad sweet
  // spot in between is cheaper — a simplified, clearly-labelled heuristic.
  if (daysUntilDeparture < 0) return 1;
  if (daysUntilDeparture < 7) return 1.22;
  if (daysUntilDeparture < 21) return 1.08;
  if (daysUntilDeparture < 45) return 0.96;
  if (daysUntilDeparture < 150) return 0.92;
  if (daysUntilDeparture < 300) return 1.0;
  return 1.12;
}

function stopsFactor(stops: number): number {
  if (stops === 0) return 1.12;
  if (stops === 1) return 0.95;
  return 0.86;
}

function driftFactor(origin: string, destination: string, dateISO: string, epoch: number): number {
  const rng = rngFor("drift", origin, destination, dateISO, Math.floor(epoch / 3));
  return 0.9 + rng() * 0.22;
}

function buildLeg(
  origin: string,
  destination: string,
  dateISO: string,
  maxStops: 0 | 1 | 2,
  seedTag: string,
): { leg: FlightLeg; priceFactor: number } {
  const rng = rngFor("leg", origin, destination, dateISO, seedTag);
  const hour = Math.floor(rng() * 24);
  const minute = rng() < 0.5 ? 0 : 30;
  const slot = timeSlotOf(hour);
  const stops = Math.min(maxStops, rng() < 0.45 ? 0 : rng() < 0.75 ? 1 : 2);
  const airline = pickAirline(rng);
  const flightNumber = flightNumberFor(airline.code, rng);

  const durationMinutes = Math.round(
    BASE_DURATION_MIN + stops * STOP_DURATION_PENALTY_MIN + (rng() - 0.5) * 60,
  );

  const departure = parseISO(`${dateISO}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  const arrival = new Date(departure.getTime() + durationMinutes * 60 * 1000);

  const stopAirports: string[] = [];
  const pool = ["ATL", "BOG", "PTY", "LIM", "GRU", "MAD"];
  for (let i = 0; i < stops; i++) {
    stopAirports.push(pool[Math.floor(rng() * pool.length)]);
  }

  const leg: FlightLeg = {
    originAirport: origin,
    destinationAirport: destination,
    departureDateTime: formatISO(departure),
    arrivalDateTime: formatISO(arrival),
    departureTimeSlot: slot,
    durationMinutes,
    stops,
    stopAirports,
    airline: airline.code,
    flightNumber,
  };

  const priceFactor = slotPriceFactor(origin, destination, slot) * stopsFactor(stops);
  return { leg, priceFactor };
}

/**
 * Builds the per-passenger price breakdown. ~80% of the time the mock
 * "provider" reports it (adult + one price per child, driven by
 * childFareFactor); the other ~20% it only gives a lump total — exercising
 * the pricingBreakdownAvailable=false path the same way a real API
 * sometimes will.
 */
function buildPassengerPricing(
  adultFare: number,
  passengers: PassengerConfig,
  currency: PassengerPriceBreakdown["currency"],
  rng: () => number,
): PassengerPriceBreakdown {
  const breakdownAvailable = rng() < 0.8;

  if (!breakdownAvailable) {
    const totalFactor =
      passengers.adults + passengers.childrenAges.reduce((sum, age) => sum + childFareFactor(age), 0);
    return {
      pricingBreakdownAvailable: false,
      adultPrice: null,
      childPrices: passengers.childrenAges.map(() => null),
      totalPrice: Math.round(adultFare * totalFactor),
      currency,
    };
  }

  const adultPrice = Math.round(adultFare);
  const childPrices = passengers.childrenAges.map((age) => Math.round(adultFare * childFareFactor(age)));
  const totalPrice = adultPrice * passengers.adults + childPrices.reduce((sum, p) => sum + p, 0);

  return { pricingBreakdownAvailable: true, adultPrice, childPrices, totalPrice, currency };
}

function buildPriceBreakdown(
  adultFare: number,
  passengers: PassengerConfig,
  currency: PassengerPriceBreakdown["currency"],
  rng: () => number,
): PriceBreakdown {
  const passengerPricing = buildPassengerPricing(adultFare, passengers, currency, rng);
  const feesKnown = passengerPricing.pricingBreakdownAvailable && rng() < 0.72;
  const fees = feesKnown ? Math.round(passengerPricing.totalPrice * (0.06 + rng() * 0.05)) : null;
  const otherKnown = feesKnown && rng() < 0.2;
  const otherCharges = otherKnown ? Math.round(rng() * 15) : null;

  return {
    passengers: passengerPricing,
    fees,
    baggageCost: null, // filled in by the caller once BaggageAllowance is known
    otherCharges,
    effectivePrice: passengerPricing.totalPrice + (fees ?? 0) + (otherCharges ?? 0),
    currency,
  };
}

function pickErrorCode(rng: () => number): ProviderErrorCode {
  const roll = rng();
  let acc = 0;
  for (const [code, weight] of ERROR_CODE_WEIGHTS) {
    acc += weight;
    if (roll < acc) return code;
  }
  return "UNKNOWN";
}

function hashPart(...parts: string[]): string {
  return parts
    .join("-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase()
    .slice(0, 60);
}

class MockFlightProviderImpl implements FlightSearchProvider {
  readonly id = "mock" as const;
  readonly label = "Mock Flight Provider (datos simulados)";
  readonly isMock = true;
  readonly capabilities: ProviderCapabilities = {
    supportsPriceCalendar: true,
    supportsFlexibleDates: true,
    supportsMultipleAirports: true,
    supportsExactFlightSearch: true,
    supportsBookingLinks: true,
    supportsPassengerPricing: true,
  };

  private config: MockProviderConfig = { ...DEFAULT_CONFIG };
  private resultsCache = new Map<string, FlightResult>();

  get rateLimit(): ProviderRateLimit {
    return this.config.rateLimit;
  }

  /** Lets the running app or a test dial in error rate / rate limit without touching the demo defaults elsewhere. */
  configure(patch: Partial<MockProviderConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  private maybeThrow(seed: string): void {
    if (this.config.forceErrorCode) {
      const code = this.config.forceErrorCode;
      throw new ProviderError(code, `Error simulado forzado (${code}) para pruebas.`, code === "RATE_LIMITED" ? 10 : undefined);
    }
    if (this.config.errorRate <= 0) return;
    const rng = rngFor("simulated-error", seed, Date.now().toString());
    if (rng() < this.config.errorRate) {
      const code = pickErrorCode(rng);
      throw new ProviderError(code, `Error simulado (${code}) para probar manejo de errores.`, code === "RATE_LIMITED" ? 500 : undefined);
    }
  }

  async searchFlights(query: FlightSearchQuery): Promise<FlightResult[]> {
    const { origin, destination, departureDate, returnDate, tripType, maxStops, searchId, searchRunId, passengers } = query;

    this.maybeThrow(`searchFlights-${origin}-${destination}-${departureDate}`);

    const base = routeBasePrice(origin, destination);
    const epoch = dayEpoch();
    const today = new Date();
    const daysUntil = differenceInCalendarDays(parseISO(departureDate), today);
    const adv = advanceFactor(daysUntil);
    const drift = driftFactor(origin, destination, departureDate, epoch);

    const optionCount = 5 + Math.floor(rngFor("count", origin, destination, departureDate)() * 4);
    const results: FlightResult[] = [];

    for (let i = 0; i < optionCount; i++) {
      const seedTag = `out-${i}`;
      const { leg: outbound, priceFactor: outFactor } = buildLeg(origin, destination, departureDate, maxStops, seedTag);

      let inbound: FlightLeg | null = null;
      let inFactor = 1;
      if (tripType === "round_trip" && returnDate) {
        const built = buildLeg(destination, origin, returnDate, maxStops, `in-${i}`);
        inbound = built.leg;
        inFactor = built.priceFactor;
      }

      const rng = rngFor("price", origin, destination, departureDate, returnDate ?? "", seedTag);
      const noise = 0.94 + rng() * 0.16;
      const combinedFactor = tripType === "round_trip" ? (outFactor + inFactor) / 2 : outFactor;
      const tripTypeFactor = tripType === "round_trip" ? 1 : 0.55;
      const adultFare = base * tripTypeFactor * combinedFactor * adv * drift * noise;

      const priceBreakdown = buildPriceBreakdown(adultFare, passengers, query.currency, rng);
      const baggage = generateBaggageAllowance(rng, priceBreakdown.passengers.adultPrice ?? adultFare);
      priceBreakdown.baggageCost = baggage.addCost;
      priceBreakdown.effectivePrice += baggage.included ? 0 : baggage.addCost ?? 0;

      const id = `mock-${hashPart(origin, destination, departureDate, returnDate ?? "", seedTag)}`;
      const foundAt = new Date();
      const expiresMinutes = 15 + Math.floor(rng() * 30);
      const booking: BookingInfo = { type: "deep_link", url: `https://example-flight-search.invalid/book/${id}` };

      const flight: FlightResult = {
        id,
        searchId,
        searchRunId,
        origin,
        destination,
        outbound,
        inbound,
        passengers,
        baggage,
        price: priceBreakdown,
        source: this.id,
        booking,
        expiresAt: new Date(foundAt.getTime() + expiresMinutes * 60 * 1000).toISOString(),
        foundAt: formatISO(foundAt),
      };

      this.resultsCache.set(id, flight);
      results.push(flight);
    }

    return results;
  }

  async getFlightDetails(flightResultId: string): Promise<FlightResult | null> {
    const flight = this.resultsCache.get(flightResultId);
    if (!flight) return null;
    // Real providers can't re-fetch an expired offer by id — mirror that here
    // instead of pretending the cached price is still valid.
    if (flight.expiresAt && new Date(flight.expiresAt).getTime() < Date.now()) return null;
    return flight;
  }

  async getPriceCalendar(query: PriceCalendarQuery): Promise<CalendarDayPrice[]> {
    const { origin, destination, dateFrom, dateTo, nights, tripType, currency } = query;

    this.maybeThrow(`getPriceCalendar-${origin}-${destination}`);

    const start = parseISO(dateFrom);
    const end = parseISO(dateTo);
    const days = Math.max(0, differenceInCalendarDays(end, start));
    const out: CalendarDayPrice[] = [];
    const base = routeBasePrice(origin, destination);
    const epoch = dayEpoch();

    for (let i = 0; i <= days; i++) {
      const date = addDays(start, i);
      const dateISO = formatISO(date, { representation: "date" });
      const returnISO =
        tripType === "round_trip" && nights ? formatISO(addDays(date, nights), { representation: "date" }) : null;

      const today = new Date();
      const daysUntil = differenceInCalendarDays(date, today);
      const adv = advanceFactor(daysUntil);
      const drift = driftFactor(origin, destination, dateISO, epoch);
      const rng = rngFor("calendar", origin, destination, dateISO, returnISO ?? "");

      let cheapest = Infinity;
      for (let s = 0; s < 4; s++) {
        const slotRng = rngFor("calendar-slot", origin, destination, dateISO, s);
        const slot = timeSlotOf(Math.floor(slotRng() * 24));
        const factor = slotPriceFactor(origin, destination, slot) * stopsFactor(slotRng() < 0.4 ? 0 : 1);
        const noise = 0.95 + rng() * 0.12;
        const tripTypeFactor = tripType === "round_trip" ? 1 : 0.55;
        const price = base * tripTypeFactor * factor * adv * drift * noise;
        if (price < cheapest) cheapest = price;
      }

      out.push({ date: dateISO, price: Math.round(cheapest), currency });
    }

    return out;
  }

  async getPriceHistory(query: PriceHistoryQuery): Promise<FlightPriceHistoryEntry[]> {
    const { origin, destination, daysBack, currency } = query;
    const base = routeBasePrice(origin, destination);
    const entries: FlightPriceHistoryEntry[] = [];
    const today = new Date();
    // Backfill/bootstrap history has no specific search's passenger mix yet —
    // it represents a one-adult market reference, documented explicitly
    // rather than silently assumed.
    const referencePassengers: PassengerConfig = { adults: 1, childrenAges: [] };

    for (let d = daysBack; d >= 0; d--) {
      const observedAt = addDays(today, -d);
      const horizon = 30 + Math.floor(rngFor("hist-horizon", origin, destination, d)() * 30);
      const departureDate = addDays(observedAt, horizon);
      const departureISO = formatISO(departureDate, { representation: "date" });
      const epoch = dayEpoch(observedAt);
      const adv = advanceFactor(horizon);
      const drift = driftFactor(origin, destination, departureISO, epoch);
      const rng = rngFor("hist", origin, destination, d);
      const { leg } = buildLeg(origin, destination, departureISO, 1, `hist-${d}`);
      const factor = slotPriceFactor(origin, destination, leg.departureTimeSlot) * stopsFactor(leg.stops);
      const noise = 0.93 + rng() * 0.18;
      const adultFare = base * factor * adv * drift * noise;
      const breakdown = buildPriceBreakdown(adultFare, referencePassengers, currency, rng);
      const baggage = generateBaggageAllowance(rng, breakdown.passengers.adultPrice ?? adultFare);

      entries.push({
        id: `hist-${hashPart(origin, destination, String(d))}`,
        timestamp: formatISO(observedAt),
        searchId: "seed",
        origin,
        destination,
        departureDate: departureISO,
        returnDate: null,
        airline: leg.airline,
        flightNumber: leg.flightNumber,
        departureTime: leg.departureDateTime,
        arrivalTime: leg.arrivalDateTime,
        returnTime: null,
        stops: leg.stops,
        durationMinutes: leg.durationMinutes,
        baggage,
        passengers: referencePassengers,
        pricingBreakdownAvailable: breakdown.passengers.pricingBreakdownAvailable,
        effectivePrice: breakdown.effectivePrice,
        currency,
        source: this.id,
        bookingUrl: `https://example-flight-search.invalid/book/hist-${d}`,
      });
    }

    return entries;
  }
}

export const mockFlightProvider = new MockFlightProviderImpl();
export { AIRLINES };
