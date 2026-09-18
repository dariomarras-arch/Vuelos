// ---------------------------------------------------------------------------
// Cron endpoint — intended to be hit by Vercel Cron (see vercel.json) or any
// external scheduler several times a day. Runs every active search whose
// `nextRunAt` has passed (or has never run), respecting the frequency
// computed in lib/scheduler/frequency.ts for each one.
//
// Protect it in production by setting CRON_SECRET and requiring it as a
// bearer token — Vercel Cron sends this automatically when configured.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getReadyRepository } from "@/lib/data/ready";
import { DEMO_USER_ID } from "@/lib/constants";
import { runSearch } from "@/lib/engine/runSearch";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — open (fine for local/demo use)
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const repo = await getReadyRepository();
  const searches = await repo.listSearches(DEMO_USER_ID);
  const now = Date.now();

  const due = searches.filter(
    (s) => s.status !== "paused" && (!s.nextRunAt || new Date(s.nextRunAt).getTime() <= now),
  );

  const results = [];
  for (const search of due) {
    const result = await runSearch(search.id);
    results.push({ searchId: search.id, name: search.name, ...result });
  }

  return NextResponse.json({
    executedAt: new Date().toISOString(),
    searchesEvaluated: searches.length,
    searchesRun: due.length,
    results,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
