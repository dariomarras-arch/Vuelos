// ---------------------------------------------------------------------------
// Alert message template — matches the format from the product spec.
// Kept separate from the alert-detection logic so the same structured data
// can later be rendered differently per channel (Telegram markdown, WhatsApp
// plain text, email HTML) without touching the detection rules.
// ---------------------------------------------------------------------------

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { FlightResult, RuleId, passengerCount } from "@/lib/types";

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

function passengerLine(flight: FlightResult): string {
  const { adults, childrenAges } = flight.passengers;
  const parts = [`${adults} adulto${adults === 1 ? "" : "s"}`];
  if (childrenAges.length > 0) parts.push(`${childrenAges.length} niño${childrenAges.length === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function bookingLine(flight: FlightResult): string[] {
  switch (flight.booking.type) {
    case "deep_link":
    case "search_link":
      return ["", "Ver vuelo:", flight.booking.url];
    case "api_order":
      return ["", "Reserva disponible vía la plataforma (sin enlace directo)."];
    case "unavailable":
      return [];
  }
}

export interface AlertMessageInput {
  flight: FlightResult;
  averagePrice: number | null;
  variationPercent: number | null;
  passedRuleIds: RuleId[];
}

export function buildAlertMessage(input: AlertMessageInput): string {
  const { flight, averagePrice, variationPercent, passedRuleIds } = input;
  const { price } = flight;
  const currency = price.currency;
  const stops = flight.outbound.stops + (flight.inbound?.stops ?? 0);
  const returnDate = flight.inbound ? fmtDate(flight.inbound.departureDateTime) : null;

  const reasons = reasonLabelsFor(passedRuleIds).map((r) => `✓ ${r}`);

  const priceLines: string[] = [`Total estimado (${passengerCount(flight.passengers)} pasajeros):`, `${currency} ${Math.round(price.effectivePrice).toLocaleString("es-AR")}`];
  if (price.passengers.pricingBreakdownAvailable && price.passengers.adultPrice !== null) {
    priceLines.push(`(adulto: ${currency} ${Math.round(price.passengers.adultPrice)} c/u)`);
  } else {
    priceLines.push("(el proveedor no informó desglose por pasajero — total de la reserva)");
  }

  const baggageLabel =
    flight.baggage.included === null ? "Equipaje: no informado" : flight.baggage.included ? "Equipaje incluido" : "Equipaje no incluido";

  const lines = [
    "✈️ OPORTUNIDAD DE VUELO",
    "",
    `${flight.origin} → ${flight.destination}`,
    "",
    returnDate ? `${fmtDate(flight.outbound.departureDateTime)} → ${returnDate}` : fmtDate(flight.outbound.departureDateTime),
    "",
    passengerLine(flight),
    ...priceLines,
    "",
    `${stops} escala${stops === 1 ? "" : "s"}`,
    baggageLabel,
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

  lines.push(...bookingLine(flight));

  return lines.join("\n");
}

export function reasonSummaryFor(passedRuleIds: RuleId[]): string {
  const labels = reasonLabelsFor(passedRuleIds);
  return labels.length > 0 ? labels[0] : "Oportunidad detectada";
}
