import { NextRequest, NextResponse } from "next/server";
import { getReadyRepository } from "@/lib/data/ready";
import { DEMO_USER_ID } from "@/lib/constants";
import { toCsv } from "@/lib/utils/csv";
import { FlightPriceHistoryEntry } from "@/lib/types";

export async function GET(req: NextRequest) {
  const repo = await getReadyRepository();
  const searchId = req.nextUrl.searchParams.get("searchId");

  let entries: FlightPriceHistoryEntry[] = [];
  if (searchId) {
    entries = await repo.getPriceHistoryForSearch(searchId, 365);
  } else {
    const searches = await repo.listSearches(DEMO_USER_ID);
    for (const s of searches) {
      entries = entries.concat(await repo.getPriceHistoryForSearch(s.id, 365));
    }
  }

  const csv = toCsv(entries as unknown as Record<string, unknown>[]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flight_price_history.csv"`,
    },
  });
}
