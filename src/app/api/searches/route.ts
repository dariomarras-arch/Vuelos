import { NextRequest, NextResponse } from "next/server";
import { getReadyRepository } from "@/lib/data/ready";
import { DEMO_USER_ID } from "@/lib/constants";
import { NewFlightSearch } from "@/lib/types";

export async function GET() {
  const repo = await getReadyRepository();
  const searches = await repo.listSearches(DEMO_USER_ID);
  return NextResponse.json(searches);
}

export async function POST(req: NextRequest) {
  const repo = await getReadyRepository();
  const body = (await req.json()) as NewFlightSearch;

  if (!body.origins?.length || !body.destinations?.length) {
    return NextResponse.json({ error: "Origen y destino son obligatorios." }, { status: 400 });
  }
  if (!body.dateFrom || !body.dateTo) {
    return NextResponse.json({ error: "El rango de fechas es obligatorio." }, { status: 400 });
  }

  const created = await repo.createSearch(DEMO_USER_ID, body);
  return NextResponse.json(created, { status: 201 });
}
