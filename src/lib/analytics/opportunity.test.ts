import { describe, expect, it } from "vitest";
import { evaluateOpportunity } from "./opportunity";
import { FlightResult, HistoricalStats } from "@/lib/types";

function makeFlight(effectivePrice: number, overrides: Partial<FlightResult> = {}): FlightResult {
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
      passengers: { pricingBreakdownAvailable: true, adultPrice: effectivePrice, childPrices: [], totalPrice: effectivePrice, currency: "USD" },
      fees: null,
      baggageCost: null,
      otherCharges: null,
      effectivePrice,
      currency: "USD",
    },
    source: "mock",
    booking: { type: "deep_link", url: "https://example.invalid/book/f1" },
    expiresAt: null,
    foundAt: "2026-09-18T12:00:00Z",
    ...overrides,
  };
}

const richHistory: HistoricalStats = {
  count: 40,
  average: 865,
  median: 840,
  min: 690,
  max: 1100,
  p10: 720,
  p25: 760,
  last7d: 850,
  last30d: 860,
  last90d: 865,
};

describe("evaluateOpportunity", () => {
  it("classifies a price well below average/min as EXCEPCIONAL and passes rules A/B/C/F", () => {
    const flight = makeFlight(700); // ~19% below average(865), within 10% of min(690)
    const evaluation = evaluateOpportunity({
      flight,
      targetPrice: 750,
      maxPrice: 850,
      historicalStats: richHistory,
      previousBestPrice: richHistory.min,
    });

    expect(evaluation.passedRuleIds).toContain("A"); // <= target
    expect(evaluation.passedRuleIds).toContain("C"); // within 10% of min
    expect(evaluation.passedRuleIds).toContain("F"); // 0 stops
    expect(["EXCEPCIONAL", "MUY_INTERESANTE"]).toContain(evaluation.level);
  });

  it("classifies a price well above average as ALTO and never recommends buying", () => {
    const flight = makeFlight(1050);
    const evaluation = evaluateOpportunity({
      flight,
      targetPrice: 750,
      maxPrice: 1100,
      historicalStats: richHistory,
      previousBestPrice: richHistory.min,
    });
    expect(evaluation.level).toBe("ALTO");
    expect(evaluation.explanation.toLowerCase()).not.toContain("comprar");
  });

  it("says history is insufficient below the minimum sample size instead of guessing", () => {
    const flight = makeFlight(700);
    const thinHistory: HistoricalStats = { ...richHistory, count: 2 };
    const evaluation = evaluateOpportunity({
      flight,
      targetPrice: 750,
      maxPrice: 850,
      historicalStats: thinHistory,
      previousBestPrice: null,
    });
    expect(evaluation.explanation).toContain("insuficiente");
  });

  it("rule E reflects baggage.included === null as not-passed, never as a crash or a silent true", () => {
    const flight = makeFlight(700, { baggage: { included: null, checkedBags: null, carryOnIncluded: null, addCost: null } });
    const evaluation = evaluateOpportunity({
      flight,
      targetPrice: 750,
      maxPrice: 850,
      historicalStats: richHistory,
      previousBestPrice: richHistory.min,
    });
    const ruleE = evaluation.rules.find((r) => r.id === "E")!;
    expect(ruleE.passed).toBe(false);
    expect(ruleE.detail).toContain("no informado");
  });
});
