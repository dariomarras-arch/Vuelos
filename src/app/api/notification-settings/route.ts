import { NextRequest, NextResponse } from "next/server";
import { getReadyRepository } from "@/lib/data/ready";
import { NotificationChannel } from "@/lib/types";

export async function GET(req: NextRequest) {
  const searchId = req.nextUrl.searchParams.get("searchId");
  if (!searchId) return NextResponse.json({ error: "searchId es requerido" }, { status: 400 });
  const repo = await getReadyRepository();
  const settings = await repo.getNotificationSettings(searchId);
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const repo = await getReadyRepository();
  const body = await req.json();

  if (!body.searchId || !body.channel) {
    return NextResponse.json({ error: "searchId y channel son requeridos" }, { status: 400 });
  }

  const saved = await repo.upsertNotificationSetting({
    id: body.id,
    searchId: body.searchId,
    channel: body.channel as NotificationChannel,
    enabled: Boolean(body.enabled),
    minimumPrice: body.minimumPrice === "" || body.minimumPrice === null ? null : Number(body.minimumPrice),
    minimumDropPercent: body.minimumDropPercent === "" || body.minimumDropPercent === null ? null : Number(body.minimumDropPercent),
    exceptionalOnly: Boolean(body.exceptionalOnly),
  });

  return NextResponse.json(saved);
}
