import { describe, expect, it } from "vitest";
import { buildSearchCacheKey, isCacheFresh, shouldUseCache, ttlToMs } from "./cache";
import { ProviderCacheEntry } from "@/lib/types";

describe("buildSearchCacheKey", () => {
  it("matches the exact format from the spec", () => {
    const key = buildSearchCacheKey({
      origin: "EZE",
      destination: "MIA",
      departureDate: "2026-11-16",
      returnDate: "2026-11-26",
      passengers: { adults: 2, childrenAges: [10, 6, 4] },
      currency: "USD",
    });
    expect(key).toBe("EZE|MIA|2026-11-16|2026-11-26|2ADT|3CHD|USD");
  });

  it("differs for a different passenger mix (dedup must not collapse different party sizes)", () => {
    const base = { origin: "EZE", destination: "MIA", departureDate: "2026-11-16", returnDate: "2026-11-26", currency: "USD" as const };
    const a = buildSearchCacheKey({ ...base, passengers: { adults: 1, childrenAges: [] } });
    const b = buildSearchCacheKey({ ...base, passengers: { adults: 2, childrenAges: [] } });
    expect(a).not.toBe(b);
  });

  it("uses a placeholder for one-way (no return date)", () => {
    const key = buildSearchCacheKey({
      origin: "EZE",
      destination: "MIA",
      departureDate: "2026-11-16",
      returnDate: null,
      passengers: { adults: 1, childrenAges: [] },
      currency: "USD",
    });
    expect(key).toBe("EZE|MIA|2026-11-16|-|1ADT|0CHD|USD");
  });
});

describe("TTL / freshness", () => {
  function entryExpiringIn(hours: number, from: Date): ProviderCacheEntry {
    return {
      key: "k",
      endpoint: "searchFlights",
      payload: [],
      createdAt: from.toISOString(),
      expiresAt: new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString(),
    };
  }

  it("ttlToMs converts hours correctly", () => {
    expect(ttlToMs(6)).toBe(6 * 60 * 60 * 1000);
    expect(ttlToMs(24)).toBe(24 * 60 * 60 * 1000);
  });

  it("is fresh before expiry and stale after", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    const entry = entryExpiringIn(12, now);
    expect(isCacheFresh(entry, new Date("2026-09-18T20:00:00Z"))).toBe(true);
    expect(isCacheFresh(entry, new Date("2026-09-19T01:00:00Z"))).toBe(false);
  });

  it("shouldUseCache is false with no entry, false on forceRefresh, true otherwise while fresh", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    const entry = entryExpiringIn(12, now);
    expect(shouldUseCache(null, { forceRefresh: false }, now)).toBe(false);
    expect(shouldUseCache(entry, { forceRefresh: true }, now)).toBe(false);
    expect(shouldUseCache(entry, { forceRefresh: false }, now)).toBe(true);
  });
});
