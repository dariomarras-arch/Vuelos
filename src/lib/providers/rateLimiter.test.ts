import { describe, expect, it } from "vitest";
import { RateLimiter, RateLimiterClock } from "./rateLimiter";

/** Deterministic fake clock: time only advances when `sleep` is awaited. */
function fakeClock(): RateLimiterClock & { advance: (ms: number) => void; elapsed: () => number } {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    elapsed: () => now,
  };
}

describe("RateLimiter", () => {
  it("allows requests up to the per-second limit without waiting", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ requestsPerSecond: 3 }, clock);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(clock.elapsed()).toBe(0);
  });

  it("waits once the per-second limit is exceeded", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ requestsPerSecond: 2 }, clock);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire(); // 3rd request within the same second must wait

    expect(clock.elapsed()).toBeGreaterThanOrEqual(1000);
  });

  it("honors requestsPerDay independently of the per-second limit", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ requestsPerSecond: 100, requestsPerDay: 2 }, clock);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire(); // must wait almost a full day

    expect(clock.elapsed()).toBeGreaterThanOrEqual(86_400_000 - 1);
  });

  it("never blocks when no limits are configured", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({}, clock);
    for (let i = 0; i < 50; i++) await limiter.acquire();
    expect(clock.elapsed()).toBe(0);
  });
});
