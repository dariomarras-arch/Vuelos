import { addDays, formatISO, parseISO } from "date-fns";
import { getReadyRepository } from "@/lib/data/ready";
import { getActiveProvider } from "@/lib/providers";
import { buildRoutes } from "@/lib/engine/combinations";
import { bestDateShift, bestDates, DateShiftInsight } from "@/lib/analytics/calendar";
import { CalendarDayPrice, FlightSearch } from "@/lib/types";

export interface CalendarData {
  search: FlightSearch;
  route: { origin: string; destination: string } | null;
  outboundCalendar: CalendarDayPrice[];
  returnCalendar: CalendarDayPrice[];
  bestOutboundDates: CalendarDayPrice[];
  shiftInsight: DateShiftInsight | null;
}

export async function getCalendarData(searchId: string): Promise<CalendarData | null> {
  const repo = await getReadyRepository();
  const search = await repo.getSearch(searchId);
  if (!search) return null;

  const provider = getActiveProvider();
  const routes = buildRoutes(search, 1);
  const route = routes[0] ?? null;

  if (!route) {
    return { search, route: null, outboundCalendar: [], returnCalendar: [], bestOutboundDates: [], shiftInsight: null };
  }

  const nights = search.tripType === "round_trip" ? search.minNights : null;

  const outboundCalendar = await provider.getPriceCalendar({
    origin: route.origin,
    destination: route.destination,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    tripType: search.tripType,
    nights,
    currency: search.currency,
  });

  let returnCalendar: CalendarDayPrice[] = [];
  if (search.tripType === "round_trip") {
    const returnFrom = formatISO(addDays(parseISO(search.dateFrom), search.minNights), { representation: "date" });
    const returnTo = formatISO(addDays(parseISO(search.dateTo), search.maxNights), { representation: "date" });
    returnCalendar = await provider.getPriceCalendar({
      origin: route.destination,
      destination: route.origin,
      dateFrom: returnFrom,
      dateTo: returnTo,
      tripType: search.tripType,
      nights,
      currency: search.currency,
    });
  }

  const bestOutboundDates = bestDates(outboundCalendar, 4);
  const shiftInsight = bestDateShift(outboundCalendar, search.dateFrom);

  return { search, route, outboundCalendar, returnCalendar, bestOutboundDates, shiftInsight };
}
