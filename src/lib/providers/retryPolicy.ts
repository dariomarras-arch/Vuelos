// ---------------------------------------------------------------------------
// Retry policy — one deterministic table, no ML, no guessing. Each
// ProviderErrorCode maps to a fixed max-attempts count and backoff shape,
// per the product spec:
//
//   RATE_LIMITED   → wait & retry (respects the provider's retryAfterMs)
//   TIMEOUT        → retry up to 2 times
//   INVALID_ROUTE  → never retry (the route is just invalid)
//   AUTHENTICATION → never retry; abort the whole run, it's a config error
//   QUOTA_EXCEEDED → never retry; abort the whole run
//   PROVIDER_ERROR → retry once (transient 5xx-style failure)
//   UNKNOWN        → never retry
// ---------------------------------------------------------------------------

import { ProviderErrorCode } from "@/lib/types";

const MAX_RETRIES: Record<ProviderErrorCode, number> = {
  RATE_LIMITED: 3,
  TIMEOUT: 2,
  INVALID_ROUTE: 0,
  AUTHENTICATION: 0,
  QUOTA_EXCEEDED: 0,
  PROVIDER_ERROR: 1,
  UNKNOWN: 0,
};

/** Codes that stop the ENTIRE run, not just the current combination. */
export const RUN_ABORTING_CODES: ProviderErrorCode[] = ["AUTHENTICATION", "QUOTA_EXCEEDED"];

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  abortRun: boolean;
}

/**
 * @param attempt 0-based — 0 is the first failure (before any retry yet).
 * @param retryAfterMs optional hint from the provider (e.g. HTTP Retry-After on a 429).
 */
export function decideRetry(code: ProviderErrorCode, attempt: number, retryAfterMs?: number): RetryDecision {
  if (RUN_ABORTING_CODES.includes(code)) {
    return { shouldRetry: false, delayMs: 0, abortRun: true };
  }

  const maxRetries = MAX_RETRIES[code];
  if (attempt >= maxRetries) {
    return { shouldRetry: false, delayMs: 0, abortRun: false };
  }

  if (code === "RATE_LIMITED") {
    const backoff = retryAfterMs ?? Math.min(10_000, 1_000 * 2 ** attempt);
    return { shouldRetry: true, delayMs: backoff, abortRun: false };
  }
  if (code === "TIMEOUT") {
    return { shouldRetry: true, delayMs: Math.min(5_000, 500 * 2 ** attempt), abortRun: false };
  }
  if (code === "PROVIDER_ERROR") {
    return { shouldRetry: true, delayMs: 500, abortRun: false };
  }

  return { shouldRetry: false, delayMs: 0, abortRun: false };
}
