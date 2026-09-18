// ---------------------------------------------------------------------------
// Combination sampling — turns a FlightSearch's broad configuration (a date
// window, a duration range, possibly several origins/destinations) into a
// bounded set of concrete (origin, destination, departureDate, nights)
// combinations the engine will actually query the provider for.
//
// The full cartesian product of a wide date range × duration range × every
// alternative airport can be enormous; we sample evenly across each
// dimension instead of brute-forcing everything, which keeps a single
// search run fast while still covering the space representatively — new
// samples are drawn each run, so repeated runs progressively cover more of
// the space.
// ---------------------------------------------------------------------------

import { addDays, differenceInCalendarDays, formatISO, parseISO } from "date-fns";
import { AIRPORT_GROUPS } from "@/lib/providers/mockData";
import { FlightSearch } from "@/lib/types";

const MAX_DATES = 10;
const MAX_NIGHTS_VALUES = 5;
const MAX_ROUTES = 8;

export function expandAirports(codes: string[], allowNearby: boolean): string[] {
  if (!allowNearby) return [...new Set(codes)];
  const expanded = new Set<string>();
  for (const code of codes) {
    expanded.add(code);
    const group = AIRPORT_GROUPS.find((g) => g.airports.includes(code));
    if (group) group.airports.forEach((a) => expanded.add(a));
  }
  return [...expanded];
}

export function sampleDates(dateFrom: string, dateTo: string, maxCount = MAX_DATES): string[] {
  const start = parseISO(dateFrom);
  const end = parseISO(dateTo);
  const totalDays = Math.max(0, differenceInCalendarDays(end, start));
  const count = Math.min(maxCount, totalDays + 1);
  if (count <= 1) return [formatISO(start, { representation: "date" })];

  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.round((i * totalDays) / (count - 1));
    dates.push(formatISO(addDays(start, offset), { representation: "date" }));
  }
  return [...new Set(dates)];
}

export function nightsRange(minNights: number, maxNights: number, maxCount = MAX_NIGHTS_VALUES): number[] {
  if (minNights >= maxNights) return [minNights];
  const span = maxNights - minNights;
  const count = Math.min(maxCount, span + 1);
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(minNights + Math.round((i * span) / (count - 1)));
  }
  return [...new Set(values)];
}

export interface RouteCombination {
  origin: string;
  destination: string;
}

export function buildRoutes(search: FlightSearch, maxRoutes = MAX_ROUTES): RouteCombination[] {
  const origins = expandAirports(search.origins, search.allowNearbyAirports);
  const destinations = expandAirports(search.destinations, search.allowNearbyAirports);
  const routes: RouteCombination[] = [];
  for (const origin of origins) {
    for (const destination of destinations) {
      routes.push({ origin, destination });
      if (routes.length >= maxRoutes) return routes;
    }
  }
  return routes;
}

export interface SearchCombination {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  nights: number | null;
}

export function buildCombinations(search: FlightSearch): SearchCombination[] {
  const routes = buildRoutes(search);
  const dates = sampleDates(search.dateFrom, search.dateTo);
  const nights = search.tripType === "round_trip" ? nightsRange(search.minNights, search.maxNights) : [null];

  const combos: SearchCombination[] = [];
  for (const route of routes) {
    for (const date of dates) {
      for (const n of nights) {
        const returnDate = n !== null ? formatISO(addDays(parseISO(date), n), { representation: "date" }) : null;
        combos.push({
          origin: route.origin,
          destination: route.destination,
          departureDate: date,
          returnDate,
          nights: n,
        });
      }
    }
  }
  return combos;
}
