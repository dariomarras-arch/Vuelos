import { describe, expect, it } from "vitest";
import { filterByBaggageRequirement, filterByStrictSchedule } from "./filters";
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
      stops: 0,
      stopAirports: [],
      airline: "LA",
      flightNumber: "LA800",
    },
    inbound: null,
    passengers: { adults: 1, childrenAges: [] },
    baggage: { included: true, checkedBags: 1, carryOnIncluded: true, addCost: null },
    price: {
      passengers: { pricingBreakdownAvailable: true, adultPrice: 700, childPrices: [], totalPrice: 700, currency: "USD" },
      fees: null,
      baggageCost: null,
      otherCharges: null,
      effectivePrice: 700,
      currency: "USD",
    },
    source: "mock",
    booking: { type: "deep_link", url: "https://example.invalid/book/f1" },
    expiresAt: null,
    foundAt: "2026-09-18T12:00:00Z",
    ...overrides,
  };
}

describe("filterByBaggageRequirement", () => {
  it("returns everything when the user requires nothing", () => {
    const flights = [makeFlight({ baggage: { included: false, checkedBags: 0, carryOnIncluded: true, addCost: 40 } })];
    expect(filterByBaggageRequirement(flights, "none")).toHaveLength(1);
  });

  it("keeps only offers with at least 1 checked bag included for checked_1", () => {
    const withBag = makeFlight({ id: "a", baggage: { included: true, checkedBags: 1, carryOnIncluded: true, addCost: null } });
    const withoutBag = makeFlight({ id: "b", baggage: { included: false, checkedBags: 0, carryOnIncluded: true, addCost: 40 } });
    const result = filterByBaggageRequirement([withBag, withoutBag], "checked_1");
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("never hides an offer with unknown baggage info by default (no informado stays visible)", () => {
    const unknown = makeFlight({ id: "u", baggage: { included: null, checkedBags: null, carryOnIncluded: null, addCost: null } });
    expect(filterByBaggageRequirement([unknown], "checked_1")).toHaveLength(1);
    expect(filterByBaggageRequirement([unknown], "checked_1", { hideUnknown: true })).toHaveLength(0);
  });
});

describe("filterByStrictSchedule", () => {
  it("passes everything through when mode is 'any' or 'preferred'", () => {
    const flights = [makeFlight()];
    expect(filterByStrictSchedule(flights, { mode: "any" })).toHaveLength(1);
    expect(
      filterByStrictSchedule(flights, { mode: "preferred", departurePreferredSlots: ["00-04"] }),
    ).toHaveLength(1); // preferred never excludes, only biases priority
  });

  it("excludes results outside the chosen departure slot when mode is 'strict'", () => {
    const inSlot = makeFlight({ id: "in" }); // 20-24
    const outOfSlot = makeFlight({
      id: "out",
      outbound: { ...makeFlight().outbound, departureTimeSlot: "08-12" },
    });
    const result = filterByStrictSchedule([inSlot, outOfSlot], { mode: "strict", departurePreferredSlots: ["20-24"] });
    expect(result.map((r) => r.id)).toEqual(["in"]);
  });

  it("also checks the return slot when the search has an inbound leg", () => {
    const badReturn = makeFlight({
      id: "bad-return",
      inbound: { ...makeFlight().outbound, departureTimeSlot: "08-12" },
    });
    const result = filterByStrictSchedule([badReturn], {
      mode: "strict",
      departurePreferredSlots: ["20-24"],
      returnPreferredSlots: ["16-20"],
    });
    expect(result).toHaveLength(0);
  });
});
