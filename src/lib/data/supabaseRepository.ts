// ---------------------------------------------------------------------------
// SupabaseRepository — real persistence backed by Postgres via Supabase.
// Activated automatically by `data/index.ts` once SUPABASE_URL and a key are
// present in the environment. Table shapes match `supabase/schema.sql`.
// ---------------------------------------------------------------------------

import { getSupabaseClient } from "@/lib/supabase/client";
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

// --- row <-> domain mappers --------------------------------------------------

function searchToRow(userId: string, s: NewFlightSearch | FlightSearch) {
  return {
    ...("id" in s ? { id: s.id } : {}),
    user_id: userId,
    name: s.name,
    origins: s.origins,
    destinations: s.destinations,
    allow_nearby_airports: s.allowNearbyAirports,
    trip_type: s.tripType,
    date_from: s.dateFrom,
    date_to: s.dateTo,
    min_nights: s.minNights,
    max_nights: s.maxNights,
    flexibility_days: s.flexibilityDays,
    adults: s.passengers.adults,
    children: s.passengers.children,
    baggage: s.baggage,
    max_stops: s.maxStops,
    target_price: s.targetPrice,
    max_price: s.maxPrice,
    currency: s.currency,
    schedule_mode: s.schedule.mode,
    departure_preferred_slots: s.schedule.departurePreferredSlots ?? null,
    return_preferred_slots: s.schedule.returnPreferredSlots ?? null,
    status: s.status ?? "active",
  };
}

function rowToSearch(row: any): FlightSearch {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    origins: row.origins,
    destinations: row.destinations,
    allowNearbyAirports: row.allow_nearby_airports,
    tripType: row.trip_type,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    minNights: row.min_nights,
    maxNights: row.max_nights,
    flexibilityDays: row.flexibility_days,
    passengers: { adults: row.adults, children: row.children },
    baggage: row.baggage,
    maxStops: row.max_stops,
    targetPrice: Number(row.target_price),
    maxPrice: Number(row.max_price),
    currency: row.currency,
    schedule: {
      mode: row.schedule_mode,
      departurePreferredSlots: row.departure_preferred_slots ?? undefined,
      returnPreferredSlots: row.return_preferred_slots ?? undefined,
    },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastError: row.last_error,
  };
}

function runToRow(r: Omit<SearchRun, "id"> & { id?: string }) {
  return {
    ...(r.id ? { id: r.id } : {}),
    search_id: r.searchId,
    started_at: r.startedAt,
    finished_at: r.finishedAt,
    combinations_analyzed: r.combinationsAnalyzed,
    flights_found: r.flightsFound,
    opportunities_found: r.opportunitiesFound,
    alerts_sent: r.alertsSent,
    status: r.status,
    error_message: r.errorMessage,
  };
}

function rowToRun(row: any): SearchRun {
  return {
    id: row.id,
    searchId: row.search_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    combinationsAnalyzed: row.combinations_analyzed,
    flightsFound: row.flights_found,
    opportunitiesFound: row.opportunities_found,
    alertsSent: row.alerts_sent,
    status: row.status,
    errorMessage: row.error_message,
  };
}

function resultToRow(r: FlightResult) {
  return {
    id: r.id,
    search_id: r.searchId,
    search_run_id: r.searchRunId,
    origin: r.origin,
    destination: r.destination,
    outbound: r.outbound,
    inbound: r.inbound,
    baggage_included: r.baggageIncluded,
    baggage_option: r.baggageOption,
    base_price: r.price.basePrice,
    fees: r.price.fees,
    baggage_cost: r.price.baggageCost,
    other_charges: r.price.otherCharges,
    effective_price: r.price.effectivePrice,
    currency: r.price.currency,
    source: r.source,
    booking_url: r.bookingUrl,
    found_at: r.foundAt,
  };
}

function rowToResult(row: any): FlightResult {
  return {
    id: row.id,
    searchId: row.search_id,
    searchRunId: row.search_run_id,
    origin: row.origin,
    destination: row.destination,
    outbound: row.outbound,
    inbound: row.inbound,
    baggageIncluded: row.baggage_included,
    baggageOption: row.baggage_option,
    price: {
      basePrice: Number(row.base_price),
      fees: row.fees === null ? null : Number(row.fees),
      baggageCost: row.baggage_cost === null ? null : Number(row.baggage_cost),
      otherCharges: row.other_charges === null ? null : Number(row.other_charges),
      effectivePrice: Number(row.effective_price),
      currency: row.currency,
    },
    source: row.source,
    bookingUrl: row.booking_url,
    foundAt: row.found_at,
  };
}

function historyToRow(e: FlightPriceHistoryEntry) {
  return {
    id: e.id,
    timestamp: e.timestamp,
    search_id: e.searchId,
    origin: e.origin,
    destination: e.destination,
    departure_date: e.departureDate,
    return_date: e.returnDate,
    airline: e.airline,
    flight_number: e.flightNumber,
    departure_time: e.departureTime,
    arrival_time: e.arrivalTime,
    return_time: e.returnTime,
    stops: e.stops,
    duration_minutes: e.durationMinutes,
    baggage: e.baggage,
    base_price: e.basePrice,
    fees: e.fees,
    baggage_cost: e.baggageCost,
    effective_price: e.effectivePrice,
    currency: e.currency,
    source: e.source,
    booking_url: e.bookingUrl,
  };
}

function rowToHistory(row: any): FlightPriceHistoryEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    searchId: row.search_id,
    origin: row.origin,
    destination: row.destination,
    departureDate: row.departure_date,
    returnDate: row.return_date,
    airline: row.airline,
    flightNumber: row.flight_number,
    departureTime: row.departure_time,
    arrivalTime: row.arrival_time,
    returnTime: row.return_time,
    stops: row.stops,
    durationMinutes: row.duration_minutes,
    baggage: row.baggage,
    basePrice: Number(row.base_price),
    fees: row.fees === null ? null : Number(row.fees),
    baggageCost: row.baggage_cost === null ? null : Number(row.baggage_cost),
    effectivePrice: Number(row.effective_price),
    currency: row.currency,
    source: row.source,
    bookingUrl: row.booking_url,
  };
}

function notifToRow(n: Omit<NotificationSetting, "id"> & { id?: string }) {
  return {
    ...(n.id ? { id: n.id } : {}),
    search_id: n.searchId,
    channel: n.channel,
    enabled: n.enabled,
    minimum_price: n.minimumPrice,
    minimum_drop_percent: n.minimumDropPercent,
    exceptional_only: n.exceptionalOnly,
  };
}

function rowToNotif(row: any): NotificationSetting {
  return {
    id: row.id,
    searchId: row.search_id,
    channel: row.channel,
    enabled: row.enabled,
    minimumPrice: row.minimum_price === null ? null : Number(row.minimum_price),
    minimumDropPercent: row.minimum_drop_percent === null ? null : Number(row.minimum_drop_percent),
    exceptionalOnly: row.exceptional_only,
  };
}

function alertToRow(a: Omit<Alert, "id">) {
  return {
    search_id: a.searchId,
    flight_result_id: a.flightResultId,
    created_at: a.createdAt,
    origin: a.origin,
    destination: a.destination,
    departure_date: a.departureDate,
    return_date: a.returnDate,
    price_per_pax: a.pricePerPax,
    total_price: a.totalPrice,
    passengers: a.passengers,
    currency: a.currency,
    average_price: a.averagePrice,
    variation_percent: a.variationPercent,
    level: a.level,
    passed_rule_ids: a.passedRuleIds,
    reason_summary: a.reasonSummary,
    message: a.message,
    status: a.status,
    dedupe_key: a.dedupeKey,
  };
}

function rowToAlert(row: any): Alert {
  return {
    id: row.id,
    searchId: row.search_id,
    flightResultId: row.flight_result_id,
    createdAt: row.created_at,
    origin: row.origin,
    destination: row.destination,
    departureDate: row.departure_date,
    returnDate: row.return_date,
    pricePerPax: Number(row.price_per_pax),
    totalPrice: Number(row.total_price),
    passengers: row.passengers,
    currency: row.currency,
    averagePrice: row.average_price === null ? null : Number(row.average_price),
    variationPercent: row.variation_percent === null ? null : Number(row.variation_percent),
    level: row.level,
    passedRuleIds: row.passed_rule_ids,
    reasonSummary: row.reason_summary,
    message: row.message,
    status: row.status,
    dedupeKey: row.dedupe_key,
  };
}

export class SupabaseRepository implements Repository {
  private get client() {
    return getSupabaseClient();
  }

  async listSearches(userId: string): Promise<FlightSearch[]> {
    const { data, error } = await this.client.from("flight_searches").select("*").eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map(rowToSearch);
  }

  async getSearch(id: string): Promise<FlightSearch | null> {
    const { data, error } = await this.client.from("flight_searches").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? rowToSearch(data) : null;
  }

  async createSearch(userId: string, input: NewFlightSearch): Promise<FlightSearch> {
    const { data, error } = await this.client
      .from("flight_searches")
      .insert(searchToRow(userId, input))
      .select("*")
      .single();
    if (error) throw error;
    return rowToSearch(data);
  }

  async updateSearch(id: string, patch: Partial<FlightSearch>): Promise<FlightSearch | null> {
    const current = await this.getSearch(id);
    if (!current) return null;
    const merged = { ...current, ...patch };
    const { data, error } = await this.client
      .from("flight_searches")
      .update({ ...searchToRow(current.userId, merged), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return rowToSearch(data);
  }

  async deleteSearch(id: string): Promise<void> {
    const { error } = await this.client.from("flight_searches").delete().eq("id", id);
    if (error) throw error;
  }

  async listSearchRuns(searchId?: string, limit = 100): Promise<SearchRun[]> {
    let query = this.client.from("search_runs").select("*").order("started_at", { ascending: false }).limit(limit);
    if (searchId) query = query.eq("search_id", searchId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(rowToRun);
  }

  async createSearchRun(run: Omit<SearchRun, "id"> & { id?: string }): Promise<SearchRun> {
    const { data, error } = await this.client.from("search_runs").insert(runToRow(run)).select("*").single();
    if (error) throw error;
    return rowToRun(data);
  }

  async saveFlightResults(results: FlightResult[]): Promise<void> {
    if (results.length === 0) return;
    const { error } = await this.client.from("flight_results").insert(results.map(resultToRow));
    if (error) throw error;
  }

  async listFlightResults(searchId: string, limit = 500): Promise<FlightResult[]> {
    const { data, error } = await this.client
      .from("flight_results")
      .select("*")
      .eq("search_id", searchId)
      .order("found_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(rowToResult);
  }

  async latestFlightResults(searchId: string): Promise<FlightResult[]> {
    const runs = await this.listSearchRuns(searchId, 1);
    if (runs.length === 0) return [];
    const { data, error } = await this.client.from("flight_results").select("*").eq("search_run_id", runs[0].id);
    if (error) throw error;
    return (data ?? []).map(rowToResult);
  }

  async appendPriceHistory(entries: FlightPriceHistoryEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const { error } = await this.client.from("flight_price_history").insert(entries.map(historyToRow));
    if (error) throw error;
  }

  async getPriceHistory(origin: string, destination: string, daysBack = 90): Promise<FlightPriceHistoryEntry[]> {
    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.client
      .from("flight_price_history")
      .select("*")
      .eq("origin", origin)
      .eq("destination", destination)
      .gte("timestamp", cutoff)
      .order("timestamp", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToHistory);
  }

  async getPriceHistoryForSearch(searchId: string, daysBack = 90): Promise<FlightPriceHistoryEntry[]> {
    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.client
      .from("flight_price_history")
      .select("*")
      .or(`search_id.eq.${searchId},search_id.eq.seed`)
      .gte("timestamp", cutoff)
      .order("timestamp", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToHistory);
  }

  async getNotificationSettings(searchId: string): Promise<NotificationSetting[]> {
    const { data, error } = await this.client.from("notification_settings").select("*").eq("search_id", searchId);
    if (error) throw error;
    return (data ?? []).map(rowToNotif);
  }

  async upsertNotificationSetting(
    setting: Omit<NotificationSetting, "id"> & { id?: string },
  ): Promise<NotificationSetting> {
    const { data, error } = await this.client
      .from("notification_settings")
      .upsert(notifToRow(setting), { onConflict: "search_id,channel" })
      .select("*")
      .single();
    if (error) throw error;
    return rowToNotif(data);
  }

  async listAlerts(searchId?: string): Promise<Alert[]> {
    let query = this.client.from("alerts").select("*").order("created_at", { ascending: false });
    if (searchId) query = query.eq("search_id", searchId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(rowToAlert);
  }

  async createAlert(alert: Omit<Alert, "id">): Promise<Alert> {
    const { data, error } = await this.client.from("alerts").insert(alertToRow(alert)).select("*").single();
    if (error) throw error;
    return rowToAlert(data);
  }

  async findAlertByDedupeKey(dedupeKey: string): Promise<Alert | null> {
    const { data, error } = await this.client
      .from("alerts")
      .select("*")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToAlert(data) : null;
  }
}

export const supabaseRepository = new SupabaseRepository();
