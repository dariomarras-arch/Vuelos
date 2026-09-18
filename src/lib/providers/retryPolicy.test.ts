import { describe, expect, it } from "vitest";
import { decideRetry } from "./retryPolicy";

describe("decideRetry", () => {
  it("RATE_LIMITED waits and retries, respecting retryAfterMs", () => {
    const d = decideRetry("RATE_LIMITED", 0, 2500);
    expect(d.shouldRetry).toBe(true);
    expect(d.delayMs).toBe(2500);
    expect(d.abortRun).toBe(false);
  });

  it("TIMEOUT retries up to 2 times then gives up", () => {
    expect(decideRetry("TIMEOUT", 0).shouldRetry).toBe(true);
    expect(decideRetry("TIMEOUT", 1).shouldRetry).toBe(true);
    expect(decideRetry("TIMEOUT", 2).shouldRetry).toBe(false);
  });

  it("INVALID_ROUTE never retries", () => {
    expect(decideRetry("INVALID_ROUTE", 0).shouldRetry).toBe(false);
  });

  it("AUTHENTICATION never retries and aborts the whole run", () => {
    const d = decideRetry("AUTHENTICATION", 0);
    expect(d.shouldRetry).toBe(false);
    expect(d.abortRun).toBe(true);
  });

  it("QUOTA_EXCEEDED never retries and aborts the whole run", () => {
    const d = decideRetry("QUOTA_EXCEEDED", 0);
    expect(d.shouldRetry).toBe(false);
    expect(d.abortRun).toBe(true);
  });

  it("PROVIDER_ERROR retries once then gives up", () => {
    expect(decideRetry("PROVIDER_ERROR", 0).shouldRetry).toBe(true);
    expect(decideRetry("PROVIDER_ERROR", 1).shouldRetry).toBe(false);
  });

  it("UNKNOWN never retries", () => {
    expect(decideRetry("UNKNOWN", 0).shouldRetry).toBe(false);
    expect(decideRetry("UNKNOWN", 0).abortRun).toBe(false);
  });
});
