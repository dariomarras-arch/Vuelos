// ---------------------------------------------------------------------------
// InMemoryRepository — zero-config demo persistence.
//
// State lives for the lifetime of the Node.js process. That's enough to
// drive a full local demo (npm run dev) with real accumulating history,
// alerts and logs. It is NOT meant for a multi-instance production
// deployment — for that, configure Supabase (see supabase/schema.sql and
// SupabaseRepository) and the exact same interface keeps working.
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto";
import {
  Alert,
  FlightPriceHistoryEntry,
  FlightResult,
  FlightSearch,
  NewFlightSearch,
  NotificationSetting,
  SearchRun,
} from "@/lib/types";
import { Repository } from "./repository";

interface Store {
  searches: FlightSearch[];
  searchRuns: SearchRun[];
  flightResults: FlightResult[];
  priceHistory: FlightPriceHistoryEntry[];
  notificationSettings: NotificationSetting[];
  alerts: Alert[];
  seeded: boolean;
}

const globalKey = "__flightHunterStore__";

function getStore(): Store {
  const g = globalThis as unknown as Record<string, Store>;
  if (!g[globalKey]) {
    g[globalKey] = {
      searches: [],
      searchRuns: [],
      flightResults: [],
      priceHistory: [],
      notificationSettings: [],
      alerts: [],
      seeded: false,
    };
  }
  return g[globalKey];
}

export class InMemoryRepository implements Repository {
  private store = getStore();

  markSeeded() {
    this.store.seeded = true;
  }

  isSeeded() {
    return this.store.seeded;
  }

  async listSearches(userId: string): Promise<FlightSearch[]> {
    return this.store.searches.filter((s) => s.userId === userId);
  }

  async getSearch(id: string): Promise<FlightSearch | null> {
    return this.store.searches.find((s) => s.id === id) ?? null;
  }

  async createSearch(userId: string, input: NewFlightSearch): Promise<FlightSearch> {
    const now = new Date().toISOString();
    const search: FlightSearch = {
      ...input,
      id: randomUUID(),
      userId,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt: null,
      lastError: null,
    };
    this.store.searches.push(search);
    return search;
  }

  async updateSearch(id: string, patch: Partial<FlightSearch>): Promise<FlightSearch | null> {
    const idx = this.store.searches.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    this.store.searches[idx] = {
      ...this.store.searches[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return this.store.searches[idx];
  }

  async deleteSearch(id: string): Promise<void> {
    this.store.searches = this.store.searches.filter((s) => s.id !== id);
  }

  async listSearchRuns(searchId?: string, limit = 100): Promise<SearchRun[]> {
    const runs = searchId ? this.store.searchRuns.filter((r) => r.searchId === searchId) : this.store.searchRuns;
    return [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }

  async createSearchRun(run: Omit<SearchRun, "id"> & { id?: string }): Promise<SearchRun> {
    const created: SearchRun = { ...run, id: run.id ?? randomUUID() };
    this.store.searchRuns.push(created);
    return created;
  }

  async saveFlightResults(results: FlightResult[]): Promise<void> {
    this.store.flightResults.push(...results);
    // Keep memory bounded: retain the most recent 4000 results overall.
    if (this.store.flightResults.length > 4000) {
      this.store.flightResults = this.store.flightResults.slice(-4000);
    }
  }

  async listFlightResults(searchId: string, limit = 500): Promise<FlightResult[]> {
    return this.store.flightResults
      .filter((r) => r.searchId === searchId)
      .sort((a, b) => b.foundAt.localeCompare(a.foundAt))
      .slice(0, limit);
  }

  async latestFlightResults(searchId: string): Promise<FlightResult[]> {
    const runs = await this.listSearchRuns(searchId, 1);
    if (runs.length === 0) return [];
    return this.store.flightResults.filter((r) => r.searchRunId === runs[0].id);
  }

  async appendPriceHistory(entries: FlightPriceHistoryEntry[]): Promise<void> {
    this.store.priceHistory.push(...entries);
    if (this.store.priceHistory.length > 20000) {
      this.store.priceHistory = this.store.priceHistory.slice(-20000);
    }
  }

  async getPriceHistory(origin: string, destination: string, daysBack = 90): Promise<FlightPriceHistoryEntry[]> {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    return this.store.priceHistory
      .filter((e) => e.origin === origin && e.destination === destination && new Date(e.timestamp).getTime() >= cutoff)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async getPriceHistoryForSearch(searchId: string, daysBack = 90): Promise<FlightPriceHistoryEntry[]> {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    return this.store.priceHistory
      .filter((e) => (e.searchId === searchId || e.searchId === "seed") && new Date(e.timestamp).getTime() >= cutoff)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async getNotificationSettings(searchId: string): Promise<NotificationSetting[]> {
    return this.store.notificationSettings.filter((n) => n.searchId === searchId);
  }

  async upsertNotificationSetting(
    setting: Omit<NotificationSetting, "id"> & { id?: string },
  ): Promise<NotificationSetting> {
    if (setting.id) {
      const idx = this.store.notificationSettings.findIndex((n) => n.id === setting.id);
      if (idx !== -1) {
        this.store.notificationSettings[idx] = { ...this.store.notificationSettings[idx], ...setting, id: setting.id };
        return this.store.notificationSettings[idx];
      }
    }
    const existingIdx = this.store.notificationSettings.findIndex(
      (n) => n.searchId === setting.searchId && n.channel === setting.channel,
    );
    if (existingIdx !== -1) {
      this.store.notificationSettings[existingIdx] = {
        ...this.store.notificationSettings[existingIdx],
        ...setting,
      };
      return this.store.notificationSettings[existingIdx];
    }
    const created: NotificationSetting = { ...setting, id: randomUUID() };
    this.store.notificationSettings.push(created);
    return created;
  }

  async listAlerts(searchId?: string): Promise<Alert[]> {
    const alerts = searchId ? this.store.alerts.filter((a) => a.searchId === searchId) : this.store.alerts;
    return [...alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createAlert(alert: Omit<Alert, "id">): Promise<Alert> {
    const created: Alert = { ...alert, id: randomUUID() };
    this.store.alerts.push(created);
    return created;
  }

  async findAlertByDedupeKey(dedupeKey: string): Promise<Alert | null> {
    return this.store.alerts.find((a) => a.dedupeKey === dedupeKey) ?? null;
  }
}

export const inMemoryRepository = new InMemoryRepository();
