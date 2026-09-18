// ---------------------------------------------------------------------------
// ProviderError — the typed error every FlightSearchProvider implementation
// should throw instead of a bare Error. The engine (engine/runSearch.ts)
// catches these per-combination, decides whether to retry via
// retryPolicy.ts, and only aborts the whole run for the two codes that
// genuinely mean "stop everything" (AUTHENTICATION, QUOTA_EXCEEDED).
// ---------------------------------------------------------------------------

import { ProviderErrorCode } from "@/lib/types";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  /** Milliseconds the caller should wait before retrying, if the provider told us (e.g. a 429's Retry-After). */
  readonly retryAfterMs?: number;

  constructor(code: ProviderErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Normalizes anything a provider implementation might throw into a ProviderError. */
export function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderError("UNKNOWN", message);
}
