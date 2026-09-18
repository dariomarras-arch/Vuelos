// ---------------------------------------------------------------------------
// Demo data seeding — only ever runs against the in-memory repository (demo
// mode). It creates the example search from the product spec plus a second
// one for variety, backfills 90 days of provider-side historical prices so
// the dashboard has enough data to compute meaningful statistics on first
// load, and runs the search engine once so there are real flight results,
// alerts and an execution log to look at immediately.
//
// This never touches Supabase — a real deployment starts with an empty,
// real database and accumulates its own history from actual scheduled runs.
// ---------------------------------------------------------------------------

import { inMemoryRepository } from "@/lib/data/inMemoryRepository";
import { getActiveProvider } from "@/lib/providers";
import { buildRoutes } from "@/lib/engine/combinations";
import { runSearch } from "@/lib/engine/runSearch";
import { DEMO_USER_ID } from "@/lib/constants";
import { FlightSearch, NewFlightSearch } from "@/lib/types";

const SEARCH_1: NewFlightSearch = {
  name: "Miami / Orlando Noviembre",
  origins: ["EZE"],
  destinations: ["MIA", "FLL", "MCO"],
  allowNearbyAirports: true,
  tripType: "round_trip",
  dateFrom: "2026-11-01",
  dateTo: "2026-11-30",
  minNights: 8,
  maxNights: 12,
  flexibilityDays: 5,
  passengers: { adults: 2, children: 3 },
  baggage: "checked_1",
  maxStops: 1,
  targetPrice: 750,
  maxPrice: 850,
  currency: "USD",
  schedule: { mode: "any" },
};

const SEARCH_2: NewFlightSearch = {
  name: "Madrid Diciembre",
  origins: ["EZE"],
  destinations: ["MAD"],
  allowNearbyAirports: false,
  tripType: "round_trip",
  dateFrom: "2026-12-01",
  dateTo: "2026-12-20",
  minNights: 10,
  maxNights: 14,
  flexibilityDays: 3,
  passengers: { adults: 2, children: 0 },
  baggage: "checked_1",
  maxStops: 1,
  targetPrice: 700,
  maxPrice: 800,
  currency: "USD",
  schedule: { mode: "any" },
};

async function backfillHistory(search: FlightSearch) {
  const provider = getActiveProvider();
  const routes = buildRoutes(search);
  for (const route of routes) {
    const entries = await provider.getPriceHistory({
      origin: route.origin,
      destination: route.destination,
      daysBack: 90,
      currency: search.currency,
    });
    await inMemoryRepository.appendPriceHistory(entries);
  }
}

export async function seedDemoData(): Promise<void> {
  if (inMemoryRepository.isSeeded()) return;
  inMemoryRepository.markSeeded(); // mark first to avoid concurrent re-entrant seeding

  const search1 = await inMemoryRepository.createSearch(DEMO_USER_ID, SEARCH_1);
  const search2 = await inMemoryRepository.createSearch(DEMO_USER_ID, SEARCH_2);

  await backfillHistory(search1);
  await backfillHistory(search2);

  await inMemoryRepository.upsertNotificationSetting({
    searchId: search1.id,
    channel: "telegram",
    enabled: true,
    minimumPrice: search1.targetPrice,
    minimumDropPercent: 10,
    exceptionalOnly: false,
  });
  await inMemoryRepository.upsertNotificationSetting({
    searchId: search1.id,
    channel: "whatsapp",
    enabled: false,
    minimumPrice: null,
    minimumDropPercent: null,
    exceptionalOnly: false,
  });
  await inMemoryRepository.upsertNotificationSetting({
    searchId: search2.id,
    channel: "telegram",
    enabled: true,
    minimumPrice: search2.targetPrice,
    minimumDropPercent: 10,
    exceptionalOnly: false,
  });

  await runSearch(search1.id);
  await runSearch(search2.id);
}
