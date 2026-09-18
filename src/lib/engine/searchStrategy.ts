// ---------------------------------------------------------------------------
// SearchStrategy — decides HOW a search should be explored, adapting the
// request shape to what the active provider can actually do (spec §2).
//
//   calendar_then_deep   — provider supports a price calendar: spend ~1
//                          cheap request per route mapping the whole date
//                          range (Level 1 — Exploración), then spend the
//                          rest of the budget on exact searches (Level 2 —
//                          Profundización) only for the zones that came back
//                          cheap.
//   sampled_exact_only   — provider has no calendar endpoint: there is no
//                          cheaper alternative, so the whole budget goes to
//                          a representative sample of exact searches
//                          (engine/combinations.ts), same as v1 but capped
//                          by the request budget instead of a hardcoded 400.
//
// Pure planning logic, no I/O — easy to unit test and to reason about
// independently of any specific provider.
// ---------------------------------------------------------------------------

import { buildRoutes, RouteCombination } from "./combinations";
import { FlightSearch, ProviderCapabilities } from "@/lib/types";

export type SearchStrategyMode = "calendar_then_deep" | "sampled_exact_only";

export interface SearchStrategyPlan {
  mode: SearchStrategyMode;
  routes: RouteCombination[];
  explorationRequestsPlanned: number;
  deepSearchBudget: number;
}

export function buildSearchStrategy(
  search: FlightSearch,
  capabilities: ProviderCapabilities,
  requestsAlreadyUsedToday: number,
): SearchStrategyPlan {
  const routes = buildRoutes(search);
  const dayRemaining = Math.max(0, search.requestBudget.maxRequestsPerDay - requestsAlreadyUsedToday);
  const effectiveRunBudget = Math.max(0, Math.min(search.requestBudget.maxRequestsPerRun, dayRemaining));

  if (capabilities.supportsPriceCalendar && effectiveRunBudget > routes.length) {
    return {
      mode: "calendar_then_deep",
      routes,
      explorationRequestsPlanned: routes.length,
      deepSearchBudget: effectiveRunBudget - routes.length,
    };
  }

  return {
    mode: "sampled_exact_only",
    routes,
    explorationRequestsPlanned: 0,
    deepSearchBudget: effectiveRunBudget,
  };
}
