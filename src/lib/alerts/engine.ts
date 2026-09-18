// ---------------------------------------------------------------------------
// Alert engine — decides which flight results become alerts and whether
// they should actually be "sent" (simulated) given the search's
// notification settings, with deduplication so repeated runs never spam the
// same flight/price twice.
// ---------------------------------------------------------------------------

import {
  Alert,
  FlightResult,
  NotificationSetting,
  OpportunityEvaluation,
} from "@/lib/types";
import { buildDedupeKey } from "./dedup";
import { buildAlertMessage, reasonSummaryFor } from "./message";
import { Repository } from "@/lib/data/repository";

const OPPORTUNITY_LEVELS = new Set(["EXCEPCIONAL", "MUY_INTERESANTE", "INTERESANTE"]);

export function isOpportunity(evaluation: OpportunityEvaluation): boolean {
  return OPPORTUNITY_LEVELS.has(evaluation.level) && evaluation.passedRuleIds.length >= 2;
}

function matchesChannel(setting: NotificationSetting, evaluation: OpportunityEvaluation, price: number): boolean {
  if (!setting.enabled) return false;
  // "Solo precio excepcional" is a hard filter on scope, not one trigger among others.
  if (setting.exceptionalOnly && evaluation.level !== "EXCEPCIONAL") return false;

  const priceThresholdSet = setting.minimumPrice !== null;
  const dropThresholdSet = setting.minimumDropPercent !== null;

  if (!priceThresholdSet && !dropThresholdSet) return true; // no extra threshold — any opportunity notifies

  // Independent checkboxes read as "notify me if ANY of these conditions hold".
  const priceMatches = priceThresholdSet && price <= (setting.minimumPrice as number);
  const dropMatches =
    dropThresholdSet && evaluation.vsAverage !== null && evaluation.vsAverage <= -(setting.minimumDropPercent as number);

  return priceMatches || dropMatches;
}

export interface AlertGenerationParams {
  flight: FlightResult;
  evaluation: OpportunityEvaluation;
  passengers: number;
  averagePrice: number | null;
}

/**
 * Evaluates one flight result against a search's notification settings and,
 * if warranted, records a deduplicated Alert. Returns null when the flight
 * is not an opportunity, or when an identical alert was already sent.
 */
export async function processAlert(
  repo: Repository,
  params: AlertGenerationParams,
  settings: NotificationSetting[],
): Promise<Alert | null> {
  const { flight, evaluation, passengers, averagePrice } = params;

  if (!isOpportunity(evaluation)) return null;

  const dedupeKey = buildDedupeKey(flight);
  const existing = await repo.findAlertByDedupeKey(dedupeKey);
  if (existing) return null; // already alerted for this exact flight/price — never duplicate

  const anyChannelMatches =
    settings.length === 0 || settings.some((s) => matchesChannel(s, evaluation, flight.price.effectivePrice));

  const message = buildAlertMessage({
    flight,
    passengers,
    averagePrice,
    variationPercent: evaluation.vsAverage,
    passedRuleIds: evaluation.passedRuleIds,
  });

  const alert = await repo.createAlert({
    searchId: flight.searchId,
    flightResultId: flight.id,
    createdAt: new Date().toISOString(),
    origin: flight.origin,
    destination: flight.destination,
    departureDate: flight.outbound.departureDateTime.slice(0, 10),
    returnDate: flight.inbound ? flight.inbound.departureDateTime.slice(0, 10) : null,
    pricePerPax: flight.price.effectivePrice,
    totalPrice: Math.round(flight.price.effectivePrice * passengers),
    passengers,
    currency: flight.price.currency,
    averagePrice,
    variationPercent: evaluation.vsAverage,
    level: evaluation.level,
    passedRuleIds: evaluation.passedRuleIds,
    reasonSummary: reasonSummaryFor(evaluation.passedRuleIds),
    message,
    status: anyChannelMatches ? "sent" : "pending",
    dedupeKey,
  });

  return alert;
}
