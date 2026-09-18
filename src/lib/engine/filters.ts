// ---------------------------------------------------------------------------
// Post-search filters (spec §11, §14).
//
//   baggageRequirement — the user's stated need ("quiero 1 valija
//   despachada") is applied as a FILTER over already-returned offers, not
//   as a provider search parameter (real fare APIs don't take baggage as a
//   search filter — see the provider audit). Used by the UI as an optional
//   toggle ("mostrar solo vuelos con equipaje incluido"); an offer with
//   unknown baggage info is never silently hidden — "no informado" stays
//   visible unless the user explicitly wants to hide it.
//
//   scheduleMode "strict" — unlike "preferred" (a priority signal, see
//   engine/priority.ts), "strict" is a real constraint: a result outside
//   the chosen slots is excluded from opportunity evaluation and alerts
//   entirely. Raw results are still persisted to history either way — data
//   collection is never gated by the user's current preference.
// ---------------------------------------------------------------------------

import { BaggageOption, FlightResult, SchedulePreference } from "@/lib/types";

export function filterByBaggageRequirement(
  results: FlightResult[],
  requirement: BaggageOption,
  { hideUnknown = false }: { hideUnknown?: boolean } = {},
): FlightResult[] {
  if (requirement === "none") return results;

  return results.filter((r) => {
    if (r.baggage.included === null) return !hideUnknown;
    switch (requirement) {
      case "carry_on":
        return r.baggage.carryOnIncluded !== false;
      case "checked_1":
        return r.baggage.included === true && (r.baggage.checkedBags ?? 0) >= 1;
      case "checked_multiple":
        return r.baggage.included === true && (r.baggage.checkedBags ?? 0) >= 2;
      default:
        return true;
    }
  });
}

export function filterByStrictSchedule(results: FlightResult[], schedule: SchedulePreference): FlightResult[] {
  if (schedule.mode !== "strict") return results;

  const departureSlots = schedule.departurePreferredSlots ?? [];
  const returnSlots = schedule.returnPreferredSlots ?? [];

  return results.filter((r) => {
    const departureOk = departureSlots.length === 0 || departureSlots.includes(r.outbound.departureTimeSlot);
    const returnOk = returnSlots.length === 0 || !r.inbound || returnSlots.includes(r.inbound.departureTimeSlot);
    return departureOk && returnOk;
  });
}
