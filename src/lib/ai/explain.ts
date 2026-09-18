// ---------------------------------------------------------------------------
// AI explanation layer.
//
// This module is the seam for a real LLM-backed explanation. It receives a
// fully-formed, factual context object (current price, history, dates,
// schedule, stops, baggage, duration and the user's own configured
// parameters) and returns a short, strictly data-grounded explanation.
//
// The current implementation is deterministic and rule-based — no external
// call, no invented numbers — so the app works without an AI provider key.
// To connect a real model (e.g. the Claude API), replace `explainOpportunity`
// with a call that sends this same `AIExplanationContext` as the prompt's
// grounding data, and keep the "never invent data, and say so when history
// is insufficient" contract.
// ---------------------------------------------------------------------------

import { FlightResult, HistoricalStats, OpportunityLevel } from "@/lib/types";
import { percentDiff } from "@/lib/analytics/stats";

export interface AIExplanationContext {
  flight: FlightResult;
  historicalStats: HistoricalStats;
  level: OpportunityLevel;
  targetPrice: number;
  maxPrice: number;
}

const MIN_HISTORY_FOR_CONFIDENCE = 5;

export function explainOpportunity(ctx: AIExplanationContext): string {
  const { flight, historicalStats, targetPrice } = ctx;
  const price = flight.price.effectivePrice;
  const currency = flight.price.currency;

  if (historicalStats.count < MIN_HISTORY_FOR_CONFIDENCE || historicalStats.average === null) {
    return "El histórico todavía es insuficiente para establecer una comparación confiable.";
  }

  const vsAverage = percentDiff(price, historicalStats.average);
  const stops = flight.outbound.stops + (flight.inbound?.stops ?? 0);
  const durationMin = flight.outbound.durationMinutes + (flight.inbound?.durationMinutes ?? 0);
  const durationH = Math.round(durationMin / 60);

  const parts: string[] = [];

  if (vsAverage !== null) {
    const direction = vsAverage < 0 ? "por debajo" : "por encima";
    parts.push(
      `El precio actual de ${currency} ${Math.round(price)} se encuentra aproximadamente ${Math.abs(vsAverage).toFixed(
        1,
      )}% ${direction} del promedio observado de ${currency} ${Math.round(historicalStats.average)} para esta ruta.`,
    );
  }

  if (historicalStats.p25 !== null) {
    const withinLowRange = price <= historicalStats.p25;
    parts.push(
      withinLowRange
        ? "Se ubica dentro del 25% de precios más bajos registrados históricamente."
        : "No se ubica dentro del rango de precios históricamente más bajos.",
    );
  }

  parts.push(
    `Itinerario de ${durationH}h con ${stops} escala${stops === 1 ? "" : "s"}, equipaje ${
      flight.baggageIncluded ? "incluido" : "no incluido"
    }.`,
  );

  parts.push(price <= targetPrice ? "Está por debajo del precio objetivo configurado." : "Está por encima del precio objetivo configurado.");

  return parts.join(" ");
}
