// ---------------------------------------------------------------------------
// Repository — the single seam between the application and persistence.
//
// Two implementations exist:
//   - InMemoryRepository: zero-config, used automatically when Supabase
//     credentials are not set. Perfect for the demo experience and for
//     local development without a database.
//   - SupabaseRepository: talks to Postgres via supabase-js, using the
//     schema in supabase/schema.sql. Activated automatically once
//     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or anon key) are present.
//
// Every screen/API route depends on this interface only — never on a
// concrete implementation — so persistence can change without touching
// business logic.
// ---------------------------------------------------------------------------

import {
  Alert,
  FlightPriceHistoryEntry,
  FlightResult,
  FlightSearch,
  NewFlightSearch,
  NotificationSetting,
  ProviderCacheEntry,
  RequestLogEntry,
  SearchRun,
} from "@/lib/types";

export interface Repository {
  // Flight searches -------------------------------------------------------
  listSearches(userId: string): Promise<FlightSearch[]>;
  getSearch(id: string): Promise<FlightSearch | null>;
  createSearch(userId: string, input: NewFlightSearch): Promise<FlightSearch>;
  updateSearch(id: string, patch: Partial<FlightSearch>): Promise<FlightSearch | null>;
  deleteSearch(id: string): Promise<void>;

  // Search runs (execution logs) ------------------------------------------
  listSearchRuns(searchId?: string, limit?: number): Promise<SearchRun[]>;
  createSearchRun(run: Omit<SearchRun, "id"> & { id?: string }): Promise<SearchRun>;

  // Flight results (latest snapshot per run) -------------------------------
  saveFlightResults(results: FlightResult[]): Promise<void>;
  listFlightResults(searchId: string, limit?: number): Promise<FlightResult[]>;
  latestFlightResults(searchId: string): Promise<FlightResult[]>;

  // Historical prices -------------------------------------------------------
  appendPriceHistory(entries: FlightPriceHistoryEntry[]): Promise<void>;
  getPriceHistory(origin: string, destination: string, daysBack?: number): Promise<FlightPriceHistoryEntry[]>;
  getPriceHistoryForSearch(searchId: string, daysBack?: number): Promise<FlightPriceHistoryEntry[]>;

  // Notification settings ---------------------------------------------------
  getNotificationSettings(searchId: string): Promise<NotificationSetting[]>;
  upsertNotificationSetting(setting: Omit<NotificationSetting, "id"> & { id?: string }): Promise<NotificationSetting>;

  // Alerts --------------------------------------------------------------------
  listAlerts(searchId?: string): Promise<Alert[]>;
  createAlert(alert: Omit<Alert, "id">): Promise<Alert>;
  findAlertByDedupeKey(dedupeKey: string): Promise<Alert | null>;

  // Provider request cache (dedup layer) ---------------------------------------
  getCacheEntry(key: string): Promise<ProviderCacheEntry | null>;
  setCacheEntry(entry: ProviderCacheEntry): Promise<void>;

  // Request log (request budget + API usage dashboard) -------------------------
  logRequest(entry: Omit<RequestLogEntry, "id">): Promise<RequestLogEntry>;
  listRequestLog(params: { searchId?: string; sinceISO?: string; limit?: number }): Promise<RequestLogEntry[]>;
}
