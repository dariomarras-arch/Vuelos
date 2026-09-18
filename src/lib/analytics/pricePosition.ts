// ---------------------------------------------------------------------------
// Price Position (spec §18) — purely descriptive placement of a current
// price against the historical distribution (min / p10 / p25 / median /
// average). Distinct from the Opportunity Score: this never folds in rules
// like target price, baggage or stops, it only answers "where does this
// number sit statistically", and says so plainly when there isn't enough
// history to answer at all.
// ---------------------------------------------------------------------------

import { HistoricalStats, PricePosition } from "@/lib/types";

const MIN_HISTORY_FOR_POSITION = 5;

export function computePricePosition(current: number, stats: HistoricalStats): PricePosition {
  const base: Omit<PricePosition, "description"> = {
    current,
    min: stats.min,
    p10: stats.p10,
    p25: stats.p25,
    median: stats.median,
    average: stats.average,
  };

  if (stats.count < MIN_HISTORY_FOR_POSITION || stats.average === null) {
    return { ...base, description: "Histórico insuficiente." };
  }

  if (stats.p10 !== null && current <= stats.p10) {
    return { ...base, description: "El precio actual está en el 10% más bajo del histórico observado." };
  }
  if (stats.p25 !== null && current <= stats.p25) {
    return { ...base, description: "El precio actual está por debajo del percentil 25 del histórico observado." };
  }
  if (stats.median !== null && current <= stats.median) {
    return { ...base, description: "El precio actual está por debajo de la mediana histórica." };
  }
  if (current <= stats.average) {
    return { ...base, description: "El precio actual está por debajo del promedio histórico." };
  }
  return { ...base, description: "El precio actual está por encima del promedio histórico." };
}
