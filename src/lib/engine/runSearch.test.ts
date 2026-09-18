import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { runSearch } from "./runSearch";
import { inMemoryRepository } from "@/lib/data/inMemoryRepository";
import { mockFlightProvider } from "@/lib/providers/MockFlightProvider";
import { NewFlightSearch } from "@/lib/types";

const DEMO_USER = "test-user";

function newSearch(overrides: Partial<NewFlightSearch> = {}): NewFlightSearch {
  return {
    name: `Test ${randomUUID()}`,
    origins: ["EZE"],
    destinations: ["MIA"],
    allowNearbyAirports: false,
    tripType: "round_trip",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-10",
    minNights: 8,
    maxNights: 8,
    flexibilityDays: 0,
    passengers: { adults: 2, childrenAges: [10, 6, 4] },
    baggageRequirement: "checked_1",
    maxStops: 1,
    targetPrice: 750,
    maxPrice: 850,
    currency: "USD",
    schedule: { mode: "any" },
    requestBudget: { maxRequestsPerRun: 3, maxRequestsPerDay: 300 },
    cacheTtlHours: 12,
    ...overrides,
  };
}

afterEach(() => {
  mockFlightProvider.resetConfig();
});

describe("runSearch — per-combination error handling", () => {
  it("keeps the run going (no thrown exception) when every combination fails with a non-aborting error", async () => {
    const search = await inMemoryRepository.createSearch(DEMO_USER, newSearch());
    mockFlightProvider.configure({ forceErrorCode: "INVALID_ROUTE" });

    const result = await runSearch(search.id);

    expect(result.status).toBe("success"); // a non-aborting error is not a run failure
    expect(result.flightsFound).toBe(0);
    expect(result.requestsUsed).toBeGreaterThan(0);

    const runs = await inMemoryRepository.listSearchRuns(search.id, 1);
    expect(runs[0].errorsByCode.INVALID_ROUTE).toBeGreaterThan(0);
  });

  it("aborts the whole run on AUTHENTICATION and flags the search as a configuration error", async () => {
    const search = await inMemoryRepository.createSearch(DEMO_USER, newSearch());
    mockFlightProvider.configure({ forceErrorCode: "AUTHENTICATION" });

    const result = await runSearch(search.id);

    expect(result.status).toBe("error");
    expect(result.flightsFound).toBe(0);
    expect(result.errorMessage).toContain("AUTHENTICATION");

    const updated = await inMemoryRepository.getSearch(search.id);
    expect(updated?.status).toBe("error");
  });

  it("aborts the whole run on QUOTA_EXCEEDED but leaves the search active for the next scheduled run", async () => {
    const search = await inMemoryRepository.createSearch(DEMO_USER, newSearch());
    mockFlightProvider.configure({ forceErrorCode: "QUOTA_EXCEEDED" });

    const result = await runSearch(search.id);

    expect(result.status).toBe("error"); // this run produced nothing
    const updated = await inMemoryRepository.getSearch(search.id);
    expect(updated?.status).toBe("active"); // but it's a transient condition, not a config problem
  });
});

describe("runSearch — request budget", () => {
  it("never spends more requests than maxRequestsPerRun", async () => {
    const search = await inMemoryRepository.createSearch(
      DEMO_USER,
      newSearch({ requestBudget: { maxRequestsPerRun: 3, maxRequestsPerDay: 300 } }),
    );

    const result = await runSearch(search.id);

    expect(result.requestsUsed).toBeLessThanOrEqual(3);
    expect(result.budgetExhausted).toBe(true); // the date range offers far more candidates than the tiny budget allows
  });
});

describe("runSearch — passengers flow through to results", () => {
  it("every FlightResult carries the exact party configured on the search", async () => {
    const search = await inMemoryRepository.createSearch(
      DEMO_USER,
      newSearch({ passengers: { adults: 2, childrenAges: [10, 6, 4] }, requestBudget: { maxRequestsPerRun: 5, maxRequestsPerDay: 300 } }),
    );

    await runSearch(search.id);
    const results = await inMemoryRepository.latestFlightResults(search.id);

    expect(results.length).toBeGreaterThan(0);
    for (const flight of results) {
      expect(flight.passengers.adults).toBe(2);
      expect(flight.passengers.childrenAges).toEqual([10, 6, 4]);
    }
  });
});
