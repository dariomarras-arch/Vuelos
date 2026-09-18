// ---------------------------------------------------------------------------
// MockFlightProvider — deterministic simulated flight data source.
//
// Used whenever no real provider is configured (the default out of the box).
// Every price is clearly synthetic and the rest of the app is responsible
// for labelling it as such ("MODO DEMO — DATOS SIMULADOS"); this file never
// pretends to be a real market.
// ---------------------------------------------------------------------------

import { addDays, differenceInCalendarDays, formatISO, parseISO } from "date-fns";
import {
  FlightSearchProvider,
  FlightSearchQuery,
  PriceCalendarQuery,
  PriceHistoryQuery,
} from "./FlightSearchProvider";
import {
  AIRLINES,
  baggageCost,
  dayEpoch,
  flightNumberFor,
  pickAirline,
  rngFor,
  routeBasePrice,
  slotPriceFactor,
  timeSlotOf,
} from "./mockData";
import {
  BaggageOption,
  CalendarDayPrice,
  FlightLeg,
  FlightPriceHistoryEntry,
  FlightResult,
  PriceBreakdown,
} from "@/lib/types";

const STOP_DURATION_PENALTY_MIN = 95; // extra minutes per connection
const BASE_DURATION_MIN = 240; // baseline nonstop-ish duration for reference routes

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
  // Slow day-to-day market drift, independent per route, so the same query
  // repeated "today" is stable but shifts gently over the following days —
  // this is what makes the price history chart look like a real market.
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

function buildPriceBreakdown(
  base: number,
  baggage: BaggageOption,
  rng: () => number,
): PriceBreakdown {
  const basePrice = Math.round(base);
  const feesKnown = rng() < 0.72;
  const fees = feesKnown ? Math.round(basePrice * (0.06 + rng() * 0.05)) : null;
  const bag = baggageCost(baggage, basePrice);
  const otherKnown = rng() < 0.2;
  const otherCharges = otherKnown ? Math.round(rng() * 15) : null;

  const effectivePrice =
    basePrice + (fees ?? 0) + (bag ?? 0) + (otherCharges ?? 0);

  return {
    basePrice,
    fees,
    baggageCost: bag,
    otherCharges,
    effectivePrice,
    currency: "USD",
  };
}

class MockFlightProviderImpl implements FlightSearchProvider {
  readonly id = "mock" as const;
  readonly label = "Mock Flight Provider (datos simulados)";
  readonly isMock = true;

  private resultsCache = new Map<string, FlightResult>();

  async searchFlights(query: FlightSearchQuery): Promise<FlightResult[]> {
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      tripType,
      baggage,
      maxStops,
      searchId,
      searchRunId,
    } = query;

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
      const { leg: outbound, priceFactor: outFactor } = buildLeg(
        origin,
        destination,
        departureDate,
        maxStops,
        seedTag,
      );

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
      const rawPrice = base * tripTypeFactor * combinedFactor * adv * drift * noise;

      const baggageIncluded = rng() < (baggage === "none" ? 0.15 : 0.55);
      const priceBreakdown = buildPriceBreakdown(rawPrice, baggage, rng);
      priceBreakdown.currency = query.currency;

      const id = `mock-${hashPart(origin, destination, departureDate, returnDate ?? "", seedTag)}`;

      const flight: FlightResult = {
        id,
        searchId,
        searchRunId,
        origin,
        destination,
        outbound,
        inbound,
        baggageIncluded,
        baggageOption: baggage,
        price: priceBreakdown,
        source: this.id,
        bookingUrl: `https://example-flight-search.invalid/book/${id}`,
        foundAt: formatISO(new Date()),
      };

      this.resultsCache.set(id, flight);
      results.push(flight);
    }

    return results;
  }

  async getFlightDetails(flightResultId: string): Promise<FlightResult | null> {
    return this.resultsCache.get(flightResultId) ?? null;
  }

  async getPriceCalendar(query: PriceCalendarQuery): Promise<CalendarDayPrice[]> {
    const { origin, destination, dateFrom, dateTo, nights, tripType, currency } = query;
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

      // Representative price: cheapest of a handful of simulated slots.
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

    for (let d = daysBack; d >= 0; d--) {
      const observedAt = addDays(today, -d);
      // Simulate a flight roughly 30-60 days out from each historical
      // observation, which is a realistic booking horizon.
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
      const basePrice = Math.round(base * factor * adv * drift * noise);
      const breakdown = buildPriceBreakdown(basePrice, "checked_1", rng);

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
        baggage: "checked_1",
        basePrice: breakdown.basePrice,
        fees: breakdown.fees,
        baggageCost: breakdown.baggageCost,
        effectivePrice: breakdown.effectivePrice,
        currency,
        source: this.id,
        bookingUrl: `https://example-flight-search.invalid/book/hist-${d}`,
      });
    }

    return entries;
  }
}

function hashPart(...parts: string[]): string {
  return parts
    .join("-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase()
    .slice(0, 60);
}

export const mockFlightProvider = new MockFlightProviderImpl();
export { AIRLINES };
