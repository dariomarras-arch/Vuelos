// ---------------------------------------------------------------------------
// Deterministic, rule-based priority scoring (spec §4). No machine learning
// — just the same kind of statistical comparison the Opportunity Engine
// already does, applied one phase earlier to decide WHICH candidates are
// worth spending a deep-search request on.
//
//   Prioridad alta:  cerca del mínimo histórico, debajo del objetivo,
//                     aeropuerto alternativo con descuento conocido,
//                     franja horaria con descuento histórico relevante
//   Prioridad media:  dentro del rango configurado, sin señal fuerte
//   Prioridad baja:   sensiblemente más caro que el resto de lo explorado
// ---------------------------------------------------------------------------

import { percentDiff } from "@/lib/analytics/stats";
import { HistoricalStats, PriorityTier, TimeSlotStat } from "@/lib/types";

export interface PriorityContext {
  historicalStats: HistoricalStats | null;
  targetPrice: number;
  bestHistoricalSlot: TimeSlotStat | null; // this route's cheapest slot, if enough data exists
  averageSlotPrice: number | null; // this route's overall average across slots, for comparison
  isAlternativeAirport: boolean; // this candidate uses a non-primary airport from an alternates group
  alternativeAirportDiscountPercent: number | null; // % cheaper than the primary airport's own history, if known
}

export interface PriorityResult {
  tier: PriorityTier;
  score: number; // 0-100, higher = explored first
  reasons: string[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function scoreCandidate(calendarPrice: number, ctx: PriorityContext): PriorityResult {
  let score = 45; // baseline sits in the "medium" band
  const reasons: string[] = [];

  const stats = ctx.historicalStats;
  if (stats && stats.count >= 5) {
    const vsMin = percentDiff(calendarPrice, stats.min);
    if (vsMin !== null) {
      if (vsMin <= 5) {
        score += 28;
        reasons.push("cerca del mínimo histórico");
      } else if (vsMin <= 15) {
        score += 14;
        reasons.push("razonablemente cerca del mínimo histórico");
      }
    }
    const vsAvg = percentDiff(calendarPrice, stats.average);
    if (vsAvg !== null && vsAvg <= -10) {
      score += 12;
      reasons.push("debajo del promedio histórico");
    }
  }

  const vsTarget = percentDiff(calendarPrice, ctx.targetPrice);
  if (vsTarget !== null) {
    if (vsTarget <= 0) {
      score += 18;
      reasons.push("dentro o debajo del precio objetivo");
    } else if (vsTarget <= 10) {
      score += 5;
    } else if (vsTarget > 30) {
      score -= 15;
      reasons.push("sensiblemente por encima del objetivo");
    }
  }

  if (ctx.bestHistoricalSlot?.averagePrice != null && ctx.averageSlotPrice) {
    const slotDiscount = percentDiff(ctx.bestHistoricalSlot.averagePrice, ctx.averageSlotPrice);
    if (slotDiscount !== null && slotDiscount <= -10) {
      score += 8;
      reasons.push(`la franja ${ctx.bestHistoricalSlot.slot} suele ser más barata en esta ruta`);
    }
  }

  if (ctx.isAlternativeAirport && ctx.alternativeAirportDiscountPercent !== null && ctx.alternativeAirportDiscountPercent <= -8) {
    score += 10;
    reasons.push("aeropuerto alternativo históricamente más barato");
  }

  score = clamp(score, 0, 100);
  const tier: PriorityTier = score >= 68 ? "high" : score >= 40 ? "medium" : "low";

  return { tier, score, reasons };
}

export function sortByPriority<T extends { score: number }>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => b.score - a.score);
}
