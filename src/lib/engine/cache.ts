// ---------------------------------------------------------------------------
// Cache key building + freshness rules — the dedup layer described in the
// spec: "si se buscó EZE→MIA 16/11 hace menos de X horas, no volver a
// consultar salvo que haya expirado el TTL, el usuario fuerce refresh, o se
// detecte una condición especial."
//
// Deliberately just pure functions here — actual storage lives in the
// repository (provider_cache), so this module has no I/O and is trivial to
// unit test.
// ---------------------------------------------------------------------------

import { CacheTtlHours, CurrencyCode, PassengerConfig, ProviderCacheEntry, TripType } from "@/lib/types";

function passengerTag(passengers: PassengerConfig): string {
  return `${passengers.adults}ADT|${passengers.childrenAges.length}CHD`;
}

/** e.g. "EZE|MIA|2026-11-16|2026-11-26|2ADT|3CHD|USD" — matches the spec's example exactly. */
export function buildSearchCacheKey(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  passengers: PassengerConfig;
  currency: CurrencyCode;
}): string {
  return [
    params.origin,
    params.destination,
    params.departureDate,
    params.returnDate ?? "-",
    passengerTag(params.passengers),
    params.currency,
  ].join("|");
}

export function buildCalendarCacheKey(params: {
  origin: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  nights: number | null;
  tripType: TripType;
  currency: CurrencyCode;
}): string {
  return [
    "calendar",
    params.origin,
    params.destination,
    params.dateFrom,
    params.dateTo,
    params.nights ?? "-",
    params.tripType,
    params.currency,
  ].join("|");
}

export function ttlToMs(hours: CacheTtlHours): number {
  return hours * 60 * 60 * 1000;
}

export function isCacheFresh(entry: Pick<ProviderCacheEntry, "expiresAt">, now: Date = new Date()): boolean {
  return new Date(entry.expiresAt).getTime() > now.getTime();
}

export interface CacheLookupOptions {
  forceRefresh: boolean;
}

/**
 * The single decision point for "do we trust the cache entry or go to the
 * provider". Structured so a future "special condition" (e.g. the cached
 * price already looked exceptional and we want to confirm it) is one more
 * clause here, not a rewrite of every call site.
 */
export function shouldUseCache(entry: ProviderCacheEntry | null, options: CacheLookupOptions, now: Date = new Date()): boolean {
  if (!entry) return false;
  if (options.forceRefresh) return false;
  return isCacheFresh(entry, now);
}
