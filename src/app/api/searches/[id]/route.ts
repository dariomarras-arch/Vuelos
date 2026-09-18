import { NextRequest, NextResponse } from "next/server";
import { getReadyRepository } from "@/lib/data/ready";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const repo = await getReadyRepository();
  const search = await repo.getSearch(params.id);
  if (!search) return NextResponse.json({ error: "Búsqueda no encontrada" }, { status: 404 });
  return NextResponse.json(search);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const repo = await getReadyRepository();
  const patch = await req.json();
  const updated = await repo.updateSearch(params.id, patch);
  if (!updated) return NextResponse.json({ error: "Búsqueda no encontrada" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const repo = await getReadyRepository();
  await repo.deleteSearch(params.id);
  return NextResponse.json({ ok: true });
}
