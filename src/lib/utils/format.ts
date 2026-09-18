import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export function money(value: number | null, currency: string = "USD"): string {
  if (value === null) return "no informado";
  return `${currency} ${Math.round(value).toLocaleString("es-AR")}`;
}

export function pct(value: number | null): string {
  if (value === null) return "s/d";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function shortDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM", { locale: es });
  } catch {
    return iso;
  }
}

export function fullDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: es });
  } catch {
    return iso;
  }
}

export function dateTime(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

export function timeOnly(iso: string): string {
  try {
    return format(parseISO(iso), "HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

export function hoursSince(iso: string | null): string {
  if (!iso) return "sin ejecuciones";
  const diffMs = Date.now() - parseISO(iso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "hace instantes";
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}
