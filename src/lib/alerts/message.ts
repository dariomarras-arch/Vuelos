// ---------------------------------------------------------------------------
// Alert message template — matches the format from the product spec.
// Kept separate from the alert-detection logic so the same structured data
// can later be rendered differently per channel (Telegram markdown, WhatsApp
// plain text, email HTML) without touching the detection rules.
// ---------------------------------------------------------------------------

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Alert, FlightResult, RuleId } from "@/lib/types";

const RULE_REASONS: Partial<Record<RuleId, string>> = {
  A: "Debajo del precio objetivo",
  B: "Debajo del promedio histórico",
  C: "Dentro del mínimo histórico",
  D: "Caída de precio relevante",
  E: "Equipaje incluido",
  F: "Vuelo directo",
  G: "Máximo 1 escala",
  H: "Ahorro vs. mejor combinación anterior",
};

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: es });
  } catch {
    return iso;
  }
}

export function reasonLabelsFor(passedRuleIds: RuleId[]): string[] {
  return passedRuleIds.map((id) => RULE_REASONS[id]).filter((x): x is string => Boolean(x));
}

export interface AlertMessageInput {
  flight: FlightResult;
  passengers: number;
  averagePrice: number | null;
  variationPercent: number | null;
  passedRuleIds: RuleId[];
}

export function buildAlertMessage(input: AlertMessageInput): string {
  const { flight, passengers, averagePrice, variationPercent, passedRuleIds } = input;
  const price = flight.price.effectivePrice;
  const currency = flight.price.currency;
  const total = Math.round(price * passengers);
  const stops = flight.outbound.stops + (flight.inbound?.stops ?? 0);
  const returnDate = flight.inbound ? fmtDate(flight.inbound.departureDateTime) : null;

  const reasons = reasonLabelsFor(passedRuleIds).map((r) => `✓ ${r}`);

  const lines = [
    "✈️ OPORTUNIDAD DE VUELO",
    "",
    `${flight.origin} → ${flight.destination}`,
    "",
    returnDate ? `${fmtDate(flight.outbound.departureDateTime)} → ${returnDate}` : fmtDate(flight.outbound.departureDateTime),
    "",
    `${passengers} pasajero${passengers === 1 ? "" : "s"}`,
    `${currency} ${Math.round(price)} por pasajero`,
    "",
    `Total estimado:`,
    `${currency} ${total.toLocaleString("es-AR")}`,
    "",
    `${stops} escala${stops === 1 ? "" : "s"}`,
    flight.baggageIncluded ? "Equipaje incluido" : "Equipaje no incluido",
  ];

  if (averagePrice !== null) {
    lines.push("", "Precio promedio:", `${currency} ${Math.round(averagePrice)}`);
  }
  if (variationPercent !== null) {
    lines.push("", "Diferencia:", `${variationPercent > 0 ? "+" : ""}${variationPercent}%`);
  }

  if (reasons.length > 0) {
    lines.push("", "Motivos:", ...reasons);
  }

  lines.push("", "Ver vuelo:", flight.bookingUrl);

  return lines.join("\n");
}

export function reasonSummaryFor(passedRuleIds: RuleId[]): string {
  const labels = reasonLabelsFor(passedRuleIds);
  return labels.length > 0 ? labels[0] : "Oportunidad detectada";
}
