import { describe, expect, it } from "vitest";
import { isOfferExpired, passengerCount } from "./types";

describe("isOfferExpired", () => {
  it("is false when there is no expiry at all", () => {
    expect(isOfferExpired({ expiresAt: null })).toBe(false);
  });

  it("is false before the expiry timestamp", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(isOfferExpired({ expiresAt: "2026-09-18T13:00:00Z" }, now)).toBe(false);
  });

  it("is true after the expiry timestamp — a stale offer is never silently treated as current", () => {
    const now = new Date("2026-09-18T14:00:00Z");
    expect(isOfferExpired({ expiresAt: "2026-09-18T13:00:00Z" }, now)).toBe(true);
  });
});

describe("passengerCount", () => {
  it("sums adults and the number of children (not their ages)", () => {
    expect(passengerCount({ adults: 2, childrenAges: [10, 6, 4] })).toBe(5);
    expect(passengerCount({ adults: 1, childrenAges: [] })).toBe(1);
  });
});
