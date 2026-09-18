import { describe, expect, it } from "vitest";
import { buildSearchStrategy } from "./searchStrategy";
import { FlightSearch, ProviderCapabilities } from "@/lib/types";

const CALENDAR_CAPABLE: ProviderCapabilities = {
  supportsPriceCalendar: true,
  supportsFlexibleDates: true,
  supportsMultipleAirports: true,
  supportsExactFlightSearch: true,
  supportsBookingLinks: true,
  supportsPassengerPricing: true,
};

const NO_CALENDAR: ProviderCapabilities = { ...CALENDAR_CAPABLE, supportsPriceCalendar: false };

function makeSearch(overrides: Partial<FlightSearch> = {}): FlightSearch {
  return {
    id: "s1",
    userId: "u1",
    name: "Test",
    origins: ["EZE"],
    destinations: ["MIA"],
    allowNearbyAirports: false,
    tripType: "round_trip",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-30",
    minNights: 8,
    maxNights: 12,
    flexibilityDays: 5,
    passengers: { adults: 2, childrenAges: [] },
    baggageRequirement: "checked_1",
    maxStops: 1,
    targetPrice: 750,
    maxPrice: 850,
    currency: "USD",
    schedule: { mode: "any" },
    requestBudget: { maxRequestsPerRun: 100, maxRequestsPerDay: 300 },
    cacheTtlHours: 12,
    status: "active",
    createdAt: "2026-09-18T00:00:00Z",
    updatedAt: "2026-09-18T00:00:00Z",
    lastRunAt: null,
    nextRunAt: null,
    lastError: null,
    ...overrides,
  };
}

describe("buildSearchStrategy", () => {
  it("uses calendar_then_deep when the provider supports a price calendar", () => {
    const plan = buildSearchStrategy(makeSearch(), CALENDAR_CAPABLE, 0);
    expect(plan.mode).toBe("calendar_then_deep");
    expect(plan.explorationRequestsPlanned).toBe(plan.routes.length);
    expect(plan.deepSearchBudget).toBe(100 - plan.routes.length);
  });

  it("falls back to sampled_exact_only when the provider has no calendar endpoint", () => {
    const plan = buildSearchStrategy(makeSearch(), NO_CALENDAR, 0);
    expect(plan.mode).toBe("sampled_exact_only");
    expect(plan.explorationRequestsPlanned).toBe(0);
    expect(plan.deepSearchBudget).toBe(100);
  });

  it("never plans more requests than maxRequestsPerRun", () => {
    const search = makeSearch({ requestBudget: { maxRequestsPerRun: 5, maxRequestsPerDay: 300 } });
    const plan = buildSearchStrategy(search, CALENDAR_CAPABLE, 0);
    const total = plan.explorationRequestsPlanned + plan.deepSearchBudget;
    expect(total).toBeLessThanOrEqual(5);
  });

  it("shrinks the run budget once part of the daily budget is already spent", () => {
    const search = makeSearch({ requestBudget: { maxRequestsPerRun: 100, maxRequestsPerDay: 300 } });
    const plan = buildSearchStrategy(search, CALENDAR_CAPABLE, 295); // only 5 left today
    const total = plan.explorationRequestsPlanned + plan.deepSearchBudget;
    expect(total).toBeLessThanOrEqual(5);
  });

  it("plans zero requests once the daily budget is already exhausted", () => {
    const search = makeSearch({ requestBudget: { maxRequestsPerRun: 100, maxRequestsPerDay: 300 } });
    const plan = buildSearchStrategy(search, CALENDAR_CAPABLE, 300);
    expect(plan.explorationRequestsPlanned + plan.deepSearchBudget).toBe(0);
  });
});
