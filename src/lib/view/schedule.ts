import { getReadyRepository } from "@/lib/data/ready";
import { aggregateTimeSlots, bestTimeSlot } from "@/lib/analytics/timeSlots";
import { FlightSearch, TimeSlotStat } from "@/lib/types";

export interface ScheduleData {
  search: FlightSearch;
  outboundSlots: TimeSlotStat[];
  returnSlots: TimeSlotStat[];
  bestOutbound: TimeSlotStat | null;
  bestReturn: TimeSlotStat | null;
}

export async function getScheduleData(searchId: string): Promise<ScheduleData | null> {
  const repo = await getReadyRepository();
  const search = await repo.getSearch(searchId);
  if (!search) return null;

  const results = await repo.listFlightResults(searchId, 500);
  const outboundSlots = aggregateTimeSlots(results, "outbound");
  const returnSlots = search.tripType === "round_trip" ? aggregateTimeSlots(results, "inbound") : [];

  return {
    search,
    outboundSlots,
    returnSlots,
    bestOutbound: bestTimeSlot(outboundSlots),
    bestReturn: bestTimeSlot(returnSlots),
  };
}
