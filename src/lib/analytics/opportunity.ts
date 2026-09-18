// ---------------------------------------------------------------------------
// Opportunity engine — classifies how unusual a price is relative to the
// user's own targets and to observed history. It is deliberately
// descriptive, never prescriptive: it reports facts and how they compare,
// it never tells the user to buy.
// ---------------------------------------------------------------------------

import {
  FlightResult,
  HistoricalStats,
  OpportunityEvaluation,
  OpportunityLevel,
  RuleEvaluation,
  RuleId,
  referenceUnitPrice,
} from "@/lib/types";
import { percentDiff } from "./stats";

export interface OpportunityInput {
  flight: FlightResult;
  targetPrice: number;
  maxPrice: number;
  historicalStats: HistoricalStats;
  previousBestPrice: number | null;
}

const RULE_LABELS: Record<RuleId, string> = {
  A: "Precio ≤ precio objetivo",
  B: "Precio ≤ 85% del promedio histórico",
  C: "Precio dentro del 10% del mínimo histórico",
  D: "Caída de precio ≥ 10% vs. referencia previa",
  E: "Equipaje incluido",
  F: "Vuelo directo (0 escalas)",
  G: "Máximo 1 escala",
  H: "Ahorro vs. mejor combinación anterior",
};

export function evaluateRules(input: OpportunityInput): RuleEvaluation[] {
  const { flight, targetPrice, historicalStats, previousBestPrice } = input;
  // All comparisons (target, historical average/min, previous-best) use the
  // per-adult-equivalent reference price, not the party total — see
  // referenceUnitPrice() in types.ts for why.
  const price = referenceUnitPrice(flight);
  const stops = flight.outbound.stops + (flight.inbound?.stops ?? 0);

  const rules: RuleEvaluation[] = [];

  rules.push({
    id: "A",
    label: RULE_LABELS.A,
    passed: price <= targetPrice,
    detail: `Precio efectivo USD ${price} vs. objetivo USD ${targetPrice}.`,
  });

  const avgThreshold = historicalStats.average !== null ? historicalStats.average * 0.85 : null;
  rules.push({
    id: "B",
    label: RULE_LABELS.B,
    passed: avgThreshold !== null && price <= avgThreshold,
    detail:
      avgThreshold !== null
        ? `Umbral 85% del promedio histórico: USD ${Math.round(avgThreshold)}.`
        : "Histórico insuficiente para evaluar esta regla.",
  });

  const nearMinThreshold = historicalStats.min !== null ? historicalStats.min * 1.1 : null;
  rules.push({
    id: "C",
    label: RULE_LABELS.C,
    passed: nearMinThreshold !== null && price <= nearMinThreshold,
    detail:
      nearMinThreshold !== null
        ? `Dentro del 10% del mínimo histórico (USD ${historicalStats.min}).`
        : "Histórico insuficiente para evaluar esta regla.",
  });

  const dropVsPrevious = previousBestPrice ? percentDiff(price, previousBestPrice) : null;
  rules.push({
    id: "D",
    label: RULE_LABELS.D,
    passed: dropVsPrevious !== null && dropVsPrevious <= -10,
    detail:
      dropVsPrevious !== null
        ? `Variación vs. referencia previa: ${dropVsPrevious}%.`
        : "Sin referencia previa disponible todavía.",
  });

  rules.push({
    id: "E",
    label: RULE_LABELS.E,
    passed: flight.baggage.included === true,
    detail:
      flight.baggage.included === null
        ? "Equipaje: no informado por el proveedor."
        : flight.baggage.included
          ? "El precio incluye equipaje."
          : "El equipaje no está incluido en este precio.",
  });

  rules.push({
    id: "F",
    label: RULE_LABELS.F,
    passed: stops === 0,
    detail: `Escalas totales del itinerario: ${stops}.`,
  });

  rules.push({
    id: "G",
    label: RULE_LABELS.G,
    passed: stops <= 1,
    detail: `Escalas totales del itinerario: ${stops}.`,
  });

  const savingsVsPrevious =
    previousBestPrice !== null && previousBestPrice > price ? previousBestPrice - price : null;
  rules.push({
    id: "H",
    label: RULE_LABELS.H,
    passed: savingsVsPrevious !== null && savingsVsPrevious > 0,
    detail:
      savingsVsPrevious !== null
        ? `Ahorro de USD ${Math.round(savingsVsPrevious)} vs. la mejor combinación anterior.`
        : "No hay una mejor combinación anterior registrada.",
  });

  return rules;
}

function classify(vsAverage: number | null, vsMin: number | null, passedCount: number): OpportunityLevel {
  if (vsAverage === null) return "NORMAL";
  if (vsMin !== null && vsMin <= 3 && vsAverage <= -20) return "EXCEPCIONAL";
  if (vsAverage <= -20) return "EXCEPCIONAL";
  if (vsAverage <= -12) return "MUY_INTERESANTE";
  if (vsAverage <= -5) return "INTERESANTE";
  if (vsAverage >= 15) return "ALTO";
  return "NORMAL";
}

function scoreFromLevel(level: OpportunityLevel, vsAverage: number | null): number {
  const base: Record<OpportunityLevel, number> = {
    EXCEPCIONAL: 92,
    MUY_INTERESANTE: 78,
    INTERESANTE: 62,
    NORMAL: 45,
    ALTO: 20,
  };
  const adjustment = vsAverage !== null ? Math.max(-10, Math.min(10, -vsAverage / 4)) : 0;
  return Math.max(0, Math.min(100, Math.round(base[level] + adjustment)));
}

export function buildExplanation(
  level: OpportunityLevel,
  price: number,
  currency: string,
  vsAverage: number | null,
  historicalStats: HistoricalStats,
): string {
  if (historicalStats.count < 5) {
    return "El histórico todavía es insuficiente para establecer una comparación confiable.";
  }
  if (vsAverage === null || historicalStats.average === null) {
    return "No hay suficiente información histórica para comparar este precio de forma confiable.";
  }

  const direction = vsAverage < 0 ? "por debajo" : "por encima";
  const magnitude = Math.abs(vsAverage);

  const levelPhrase: Record<OpportunityLevel, string> = {
    EXCEPCIONAL: "El precio actual se ubica en el extremo inferior del histórico observado para esta ruta.",
    MUY_INTERESANTE: "El precio actual se encuentra significativamente por debajo del histórico observado.",
    INTERESANTE: "El precio actual se encuentra moderadamente por debajo del histórico observado.",
    NORMAL: "El precio actual se encuentra dentro del rango habitual observado para esta ruta.",
    ALTO: "El precio actual se encuentra por encima del rango habitual observado para esta ruta.",
  };

  return (
    `${levelPhrase[level]} ` +
    `Precio actual de ${currency} ${Math.round(price)} frente a un promedio observado de ${currency} ${Math.round(
      historicalStats.average,
    )} (${magnitude.toFixed(1)}% ${direction} del promedio).`
  );
}

export function evaluateOpportunity(input: OpportunityInput): OpportunityEvaluation {
  const { flight, targetPrice, historicalStats } = input;
  const price = referenceUnitPrice(flight);

  const vsTarget = percentDiff(price, targetPrice);
  const vsAverage = percentDiff(price, historicalStats.average);
  const vsMin = percentDiff(price, historicalStats.min);

  const rules = evaluateRules(input);
  const passedRuleIds = rules.filter((r) => r.passed).map((r) => r.id);

  const level = classify(vsAverage, vsMin, passedRuleIds.length);
  const score = scoreFromLevel(level, vsAverage);
  const explanation = buildExplanation(level, price, flight.price.currency, vsAverage, historicalStats);

  return {
    flightResultId: flight.id,
    level,
    score,
    vsTarget,
    vsAverage,
    vsMin,
    rules,
    passedRuleIds,
    explanation,
  };
}
