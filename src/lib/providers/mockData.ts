// ---------------------------------------------------------------------------
// Deterministic pseudo-random helpers + reference mock data used by
// MockFlightProvider. Deterministic seeding means the same route/date/time
// combination always produces internally-consistent numbers within a single
// day, while still drifting day to day — which is what lets the historical
// charts show a believable, analyzable market instead of pure noise.
// ---------------------------------------------------------------------------

import { Airline, Airport, AirportGroup, BaggageAllowance, TimeSlotKey } from "@/lib/types";

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — small, fast, deterministic from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(...parts: (string | number)[]): () => number {
  return mulberry32(hashString(parts.join("|")));
}

/** Day bucket used to make the "market" drift slowly instead of jumping. */
export function dayEpoch(date: Date = new Date()): number {
  return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export const AIRPORTS: Airport[] = [
  { iata: "EZE", name: "Ministro Pistarini", city: "Buenos Aires", country: "AR", groupId: "BUE" },
  { iata: "AEP", name: "Jorge Newbery", city: "Buenos Aires", country: "AR", groupId: "BUE" },
  { iata: "MIA", name: "Miami Intl.", city: "Miami", country: "US", groupId: "MIA" },
  { iata: "FLL", name: "Fort Lauderdale-Hollywood", city: "Fort Lauderdale", country: "US", groupId: "MIA" },
  { iata: "MCO", name: "Orlando Intl.", city: "Orlando", country: "US", groupId: "ORL" },
  { iata: "SFB", name: "Orlando Sanford", city: "Orlando", country: "US", groupId: "ORL" },
  { iata: "JFK", name: "John F. Kennedy Intl.", city: "New York", country: "US", groupId: "NYC" },
  { iata: "EWR", name: "Newark Liberty", city: "New York", country: "US", groupId: "NYC" },
  { iata: "MAD", name: "Adolfo Suárez Madrid-Barajas", city: "Madrid", country: "ES" },
  { iata: "GRU", name: "Guarulhos", city: "São Paulo", country: "BR" },
  { iata: "SCL", name: "Arturo Merino Benítez", city: "Santiago", country: "CL" },
  { iata: "BOG", name: "El Dorado", city: "Bogotá", country: "CO" },
];

export const AIRPORT_GROUPS: AirportGroup[] = [
  { id: "BUE", label: "Buenos Aires", airports: ["EZE", "AEP"] },
  { id: "MIA", label: "Miami", airports: ["MIA", "FLL"] },
  { id: "ORL", label: "Orlando", airports: ["MCO", "SFB"] },
  { id: "NYC", label: "Nueva York", airports: ["JFK", "EWR"] },
];

export const AIRLINES: Airline[] = [
  { code: "AA", name: "American Airlines" },
  { code: "LA", name: "LATAM Airlines" },
  { code: "UA", name: "United Airlines" },
  { code: "AR", name: "Aerolíneas Argentinas" },
  { code: "AV", name: "Avianca" },
  { code: "CM", name: "Copa Airlines" },
  { code: "DL", name: "Delta Air Lines" },
  { code: "B6", name: "JetBlue Airways" },
];

/** Base fare reference per O/D pair (USD, one-way, economy, before noise). */
// Reference is roughly a typical round-trip economy fare in USD; one-way
// queries apply an additional discount factor (see MockFlightProvider).
const ROUTE_BASE_PRICE: Record<string, number> = {
  "EZE-MIA": 730,
  "EZE-FLL": 700,
  "EZE-MCO": 760,
  "EZE-SFB": 745,
  "EZE-JFK": 820,
  "EZE-EWR": 800,
  "EZE-MAD": 880,
  "EZE-GRU": 300,
  "EZE-SCL": 280,
  "EZE-BOG": 540,
  "AEP-MIA": 745,
  "AEP-MCO": 770,
};

export function routeBasePrice(origin: string, destination: string): number {
  const key = `${origin}-${destination}`;
  if (ROUTE_BASE_PRICE[key]) return ROUTE_BASE_PRICE[key];
  // Fallback: derive a stable pseudo-price from the route hash so unknown
  // pairs still behave consistently instead of erroring.
  const rng = rngFor("route-base", key);
  return Math.round(350 + rng() * 550);
}

export function timeSlotOf(hour: number): TimeSlotKey {
  if (hour < 4) return "00-04";
  if (hour < 8) return "04-08";
  if (hour < 12) return "08-12";
  if (hour < 16) return "12-16";
  if (hour < 20) return "16-20";
  return "20-24";
}

export const TIME_SLOT_HOURS: Record<TimeSlotKey, number[]> = {
  "00-04": [0, 1, 2, 3],
  "04-08": [4, 5, 6, 7],
  "08-12": [8, 9, 10, 11],
  "12-16": [12, 13, 14, 15],
  "16-20": [16, 17, 18, 19],
  "20-24": [20, 21, 22, 23],
};

/**
 * Each route has a hidden "cheapest slot" and "priciest slot" baked into its
 * hash — deliberately not the same slot for every route, and not exposed
 * anywhere directly. The app is meant to *discover* this statistically from
 * generated results rather than the UI assuming a fixed rule, mirroring the
 * spec's requirement to never assume one time slot is always cheaper.
 */
export function slotPriceFactor(origin: string, destination: string, slot: TimeSlotKey): number {
  const rng = rngFor("slot-factor", origin, destination, slot);
  // Spread factors between 0.90 and 1.18 so differences are visible but not
  // extreme, and vary by route + slot combination.
  return 0.9 + rng() * 0.28;
}

/**
 * Simplified, clearly-simulated child fare bands — NOT a real airline fare
 * rule (real rules vary per airline/route, which is exactly the audit
 * finding this replaces: a flat per-head price is wrong). Infants pay a
 * fraction (no seat), children a partial fare, everyone else the adult
 * rate.
 */
export function childFareFactor(age: number): number {
  if (age < 2) return 0.1;
  if (age < 12) return 0.75;
  return 1;
}

/**
 * Simulates baggage as an attribute of the OFFER (never a search input).
 * ~15% of generated offers deliberately omit baggage details entirely, to
 * exercise the "no informado" path the way a real provider sometimes will.
 */
export function generateBaggageAllowance(rng: () => number, adultPrice: number): BaggageAllowance {
  const informed = rng() < 0.85;
  if (!informed) {
    return { included: null, checkedBags: null, carryOnIncluded: null, addCost: null };
  }
  const included = rng() < 0.55;
  return {
    included,
    checkedBags: included ? (rng() < 0.7 ? 1 : 2) : 0,
    carryOnIncluded: rng() < 0.9,
    addCost: included ? null : Math.round(adultPrice * (0.08 + rng() * 0.1)),
  };
}

export function pickAirline(rng: () => number): Airline {
  return AIRLINES[Math.floor(rng() * AIRLINES.length)];
}

export function flightNumberFor(airline: string, rng: () => number): string {
  return `${airline}${100 + Math.floor(rng() * 899)}`;
}
