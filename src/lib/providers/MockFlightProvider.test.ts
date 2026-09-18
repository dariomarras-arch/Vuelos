import { afterEach, describe, expect, it } from "vitest";
import { mockFlightProvider } from "./MockFlightProvider";
import { FlightSearchQuery } from "./FlightSearchProvider";

afterEach(() => {
  mockFlightProvider.resetConfig();
});

const baseQuery: Omit<FlightSearchQuery, "passengers"> = {
  origin: "EZE",
  destination: "MIA",
  departureDate: "2026-11-16",
  returnDate: "2026-11-26",
  tripType: "round_trip",
  maxStops: 1,
  currency: "USD",
  searchId: "test-search",
  searchRunId: "test-run",
};

describe("MockFlightProvider — total price formula", () => {
  it("effectivePrice always equals passengers.totalPrice + known fees/baggage/other (never drifts)", async () => {
    const results = await mockFlightProvider.searchFlights({
      ...baseQuery,
      passengers: { adults: 2, childrenAges: [10, 6, 4] },
    });

    expect(results.length).toBeGreaterThan(0);
    for (const flight of results) {
      const { price } = flight;
      const expected = price.passengers.totalPrice + (price.fees ?? 0) + (price.baggageCost ?? 0) + (price.otherCharges ?? 0);
      expect(price.effectivePrice).toBeCloseTo(expected, 5);
    }
  });

  it("never invents a per-passenger split when pricingBreakdownAvailable is false", async () => {
    const results = await mockFlightProvider.searchFlights({
      ...baseQuery,
      passengers: { adults: 2, childrenAges: [10, 6, 4] },
    });

    const withoutBreakdown = results.filter((r) => !r.price.passengers.pricingBreakdownAvailable);
    for (const flight of withoutBreakdown) {
      expect(flight.price.passengers.adultPrice).toBeNull();
      expect(flight.price.passengers.childPrices.every((p) => p === null)).toBe(true);
      // totalPrice must still be a real number — the lump sum from the provider, not fabricated
      expect(flight.price.passengers.totalPrice).toBeGreaterThan(0);
    }
  });
});

describe("MockFlightProvider — differentiated child pricing", () => {
  it("prices children below the adult fare according to age band, when a breakdown is available", async () => {
    // ages: 1 (infant band), 8 (child band), 15 (treated as adult) — spans all three bands
    const results = await mockFlightProvider.searchFlights({
      ...baseQuery,
      passengers: { adults: 2, childrenAges: [1, 8, 15] },
    });

    const withBreakdown = results.filter((r) => r.price.passengers.pricingBreakdownAvailable);
    expect(withBreakdown.length).toBeGreaterThan(0);

    for (const flight of withBreakdown) {
      const { adultPrice, childPrices } = flight.price.passengers;
      expect(adultPrice).not.toBeNull();
      const [infantPrice, childPrice, teenPrice] = childPrices;
      // infant (age 1) must be cheaper than child (age 8), which must be cheaper than (or equal to) the adult-rate teen (age 15)
      expect(infantPrice).not.toBeNull();
      expect(childPrice).not.toBeNull();
      expect(teenPrice).not.toBeNull();
      expect(infantPrice!).toBeLessThan(childPrice!);
      expect(childPrice!).toBeLessThanOrEqual(teenPrice!);
      expect(teenPrice).toBeCloseTo(adultPrice!, 0);
    }
  });

  it("totalPrice sums adults*adultPrice + every childPrice when a breakdown is available", async () => {
    const results = await mockFlightProvider.searchFlights({
      ...baseQuery,
      passengers: { adults: 2, childrenAges: [10, 6, 4] },
    });
    const withBreakdown = results.filter((r) => r.price.passengers.pricingBreakdownAvailable);
    expect(withBreakdown.length).toBeGreaterThan(0);

    for (const flight of withBreakdown) {
      const { adultPrice, childPrices, totalPrice } = flight.price.passengers;
      const expected = adultPrice! * 2 + childPrices.reduce((sum: number, p) => sum + (p ?? 0), 0);
      expect(totalPrice).toBe(expected);
    }
  });
});

describe("MockFlightProvider — baggage as an offer attribute", () => {
  it("never reports a partial baggage breakdown: either everything is informed or nothing is", async () => {
    const results = await mockFlightProvider.searchFlights({ ...baseQuery, passengers: { adults: 1, childrenAges: [] } });
    for (const flight of results) {
      const { included, checkedBags, carryOnIncluded, addCost } = flight.baggage;
      if (included === null) {
        expect(checkedBags).toBeNull();
        expect(carryOnIncluded).toBeNull();
        expect(addCost).toBeNull();
      }
    }
  });
});

describe("MockFlightProvider — ephemeral offers", () => {
  it("sets an expiresAt in the future relative to foundAt", async () => {
    const results = await mockFlightProvider.searchFlights({ ...baseQuery, passengers: { adults: 1, childrenAges: [] } });
    for (const flight of results) {
      expect(flight.expiresAt).not.toBeNull();
      expect(new Date(flight.expiresAt!).getTime()).toBeGreaterThan(new Date(flight.foundAt).getTime());
    }
  });

  it("getFlightDetails returns null for an offer that has already expired", async () => {
    const results = await mockFlightProvider.searchFlights({ ...baseQuery, passengers: { adults: 1, childrenAges: [] } });
    const flight = results[0];
    // Force-expire it by asking for details "after" its expiry.
    const original = flight.expiresAt!;
    flight.expiresAt = new Date(Date.now() - 1000).toISOString();
    const details = await mockFlightProvider.getFlightDetails(flight.id);
    expect(details).toBeNull();
    flight.expiresAt = original;
  });
});

describe("MockFlightProvider — simulated errors (configurable)", () => {
  it("throws the forced ProviderError code on every call when configured", async () => {
    mockFlightProvider.configure({ forceErrorCode: "RATE_LIMITED" });
    await expect(
      mockFlightProvider.searchFlights({ ...baseQuery, passengers: { adults: 1, childrenAges: [] } }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("never throws when errorRate is 0 (the default — demo/seed data must stay reliable)", async () => {
    await expect(
      mockFlightProvider.searchFlights({ ...baseQuery, passengers: { adults: 1, childrenAges: [] } }),
    ).resolves.toBeDefined();
  });
});
