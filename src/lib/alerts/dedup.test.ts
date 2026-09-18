import { describe, expect, it } from "vitest";
import { buildDedupeKey } from "./dedup";
import { FlightResult } from "@/lib/types";

function makeFlight(overrides: Partial<FlightResult> = {}): FlightResult {
  return {
    id: "f1",
    searchId: "s1",
    searchRunId: "r1",
    origin: "EZE",
    destination: "MIA",
    outbound: {
      originAirport: "EZE",
      destinationAirport: "MIA",
      departureDateTime: "2026-11-16T21:30:00Z",
      arrivalDateTime: "2026-11-17T05:00:00Z",
      departureTimeSlot: "20-24",
      durationMinutes: 570,
      stops: 1,
      stopAirports: ["GRU"],
      airline: "LA",
      flightNumber: "LA800",
    },
    inbound: null,
    passengers: { adults: 2, childrenAges: [] },
    baggage: { included: true, checkedBags: 1, carryOnIncluded: true, addCost: null },
    price: {
      passengers: { pricingBreakdownAvailable: true, adultPrice: 735, childPrices: [], totalPrice: 1470, currency: "USD" },
      fees: null,
      baggageCost: null,
      otherCharges: null,
      effectivePrice: 1470,
      currency: "USD",
    },
    source: "mock",
    booking: { type: "deep_link", url: "https://example.invalid/book/f1" },
    expiresAt: null,
    foundAt: "2026-09-18T12:00:00Z",
    ...overrides,
  };
}

describe("buildDedupeKey", () => {
  it("is stable for the exact same flight/price", () => {
    const flight = makeFlight();
    expect(buildDedupeKey(flight)).toBe(buildDedupeKey(makeFlight()));
  });

  it("buckets small price fluctuations ($5) into the same key", () => {
    const a = makeFlight();
    const b = makeFlight({
      price: { ...a.price, effectivePrice: a.price.effectivePrice + 2 },
    });
    expect(buildDedupeKey(a)).toBe(buildDedupeKey(b));
  });

  it("produces a different key once the price moves past the bucket", () => {
    const a = makeFlight();
    const b = makeFlight({
      price: { ...a.price, effectivePrice: a.price.effectivePrice + 50 },
    });
    expect(buildDedupeKey(a)).not.toBe(buildDedupeKey(b));
  });

  it("produces a different key for a different flight number", () => {
    const a = makeFlight();
    const b = makeFlight({ outbound: { ...a.outbound, flightNumber: "LA801" } });
    expect(buildDedupeKey(a)).not.toBe(buildDedupeKey(b));
  });
});
