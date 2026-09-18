// ---------------------------------------------------------------------------
// RateLimiter — generic client-side pacing. Never assumes a provider's
// limits; it is always constructed FROM the active provider's declared
// `rateLimit` (see FlightSearchProvider.rateLimit). Call `await
// limiter.acquire()` immediately before every real provider call (cache
// hits skip it entirely — they never touch the network).
//
// Sliding-window counters, not a fixed token bucket, so bursts right at a
// window boundary don't cheat the limit. `now`/`sleep` are injectable so
// tests can drive it with fake time instead of real waits.
// ---------------------------------------------------------------------------

import { ProviderRateLimit } from "@/lib/types";

export interface RateLimiterClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: RateLimiterClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class RateLimiter {
  private readonly config: ProviderRateLimit;
  private readonly clock: RateLimiterClock;
  private secondWindow: number[] = [];
  private minuteWindow: number[] = [];
  private dayWindow: number[] = [];

  constructor(config: ProviderRateLimit, clock: RateLimiterClock = realClock) {
    this.config = config;
    this.clock = clock;
  }

  private prune(now: number) {
    this.secondWindow = this.secondWindow.filter((t) => now - t < 1_000);
    this.minuteWindow = this.minuteWindow.filter((t) => now - t < 60_000);
    this.dayWindow = this.dayWindow.filter((t) => now - t < 86_400_000);
  }

  private nextAvailableAt(now: number): number {
    let waitUntil = now;
    const { requestsPerSecond, requestsPerMinute, requestsPerDay } = this.config;

    if (requestsPerSecond && this.secondWindow.length >= requestsPerSecond) {
      waitUntil = Math.max(waitUntil, this.secondWindow[0] + 1_000);
    }
    if (requestsPerMinute && this.minuteWindow.length >= requestsPerMinute) {
      waitUntil = Math.max(waitUntil, this.minuteWindow[0] + 60_000);
    }
    if (requestsPerDay && this.dayWindow.length >= requestsPerDay) {
      waitUntil = Math.max(waitUntil, this.dayWindow[0] + 86_400_000);
    }
    return waitUntil;
  }

  /** Blocks (via the injected sleep) until issuing one more request would stay within every configured window, then records it. */
  async acquire(): Promise<void> {
    let now = this.clock.now();
    this.prune(now);
    const availableAt = this.nextAvailableAt(now);

    if (availableAt > now) {
      await this.clock.sleep(availableAt - now);
      now = this.clock.now();
      this.prune(now);
    }

    this.secondWindow.push(now);
    this.minuteWindow.push(now);
    this.dayWindow.push(now);
  }
}
