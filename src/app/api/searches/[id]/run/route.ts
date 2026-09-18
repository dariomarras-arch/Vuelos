import { NextRequest, NextResponse } from "next/server";
import { getReadyRepository } from "@/lib/data/ready";
import { runSearch } from "@/lib/engine/runSearch";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const repo = await getReadyRepository();
  const search = await repo.getSearch(params.id);
  if (!search) return NextResponse.json({ error: "Búsqueda no encontrada" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const forceRefresh = Boolean(body.forceRefresh);

  const result = await runSearch(params.id, { forceRefresh });
  return NextResponse.json(result);
}
