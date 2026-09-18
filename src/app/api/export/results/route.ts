import { NextRequest, NextResponse } from "next/server";
import { getReadyRepository } from "@/lib/data/ready";
import { toCsv } from "@/lib/utils/csv";

export async function GET(req: NextRequest) {
  const repo = await getReadyRepository();
  const searchId = req.nextUrl.searchParams.get("searchId");
  if (!searchId) {
    return NextResponse.json({ error: "searchId es requerido" }, { status: 400 });
  }

  const results = await repo.listFlightResults(searchId, 2000);
  const rows = results.map((r) => ({
    foundAt: r.foundAt,
    origin: r.origin,
    destination: r.destination,
    airline: r.outbound.airline,
    flightNumber: r.outbound.flightNumber,
    departureTime: r.outbound.departureDateTime,
    returnTime: r.inbound?.departureDateTime ?? "",
    stops: r.outbound.stops + (r.inbound?.stops ?? 0),
    adults: r.passengers.adults,
    children: r.passengers.childrenAges.length,
    baggageIncluded: r.baggage.included ?? "no informado",
    pricingBreakdownAvailable: r.price.passengers.pricingBreakdownAvailable,
    adultPrice: r.price.passengers.adultPrice ?? "",
    fees: r.price.fees ?? "",
    baggageCost: r.price.baggageCost ?? "",
    effectivePrice: r.price.effectivePrice,
    currency: r.price.currency,
    bookingUrl: r.booking.type === "deep_link" || r.booking.type === "search_link" ? r.booking.url : "",
    expiresAt: r.expiresAt ?? "",
  }));

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flight_results.csv"`,
    },
  });
}
