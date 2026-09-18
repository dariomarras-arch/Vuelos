import { NextRequest, NextResponse } from "next/server";
import { getReadyRepository } from "@/lib/data/ready";
import { toCsv } from "@/lib/utils/csv";

export async function GET(req: NextRequest) {
  const repo = await getReadyRepository();
  const searchId = req.nextUrl.searchParams.get("searchId") ?? undefined;
  const alerts = await repo.listAlerts(searchId);

  const rows = alerts.map((a) => ({
    createdAt: a.createdAt,
    origin: a.origin,
    destination: a.destination,
    departureDate: a.departureDate,
    returnDate: a.returnDate ?? "",
    adults: a.passengers.adults,
    children: a.passengers.childrenAges.length,
    totalPrice: a.totalPrice,
    pricingBreakdownAvailable: a.pricingBreakdownAvailable,
    adultPrice: a.adultPrice ?? "",
    currency: a.currency,
    averagePrice: a.averagePrice ?? "",
    variationPercent: a.variationPercent ?? "",
    level: a.level,
    reasonSummary: a.reasonSummary,
    status: a.status,
  }));

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alerts.csv"`,
    },
  });
}
