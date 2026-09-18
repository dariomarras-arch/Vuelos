// ---------------------------------------------------------------------------
// getReadyRepository — what pages and API routes should call instead of
// getRepository() directly. In demo mode it lazily seeds example data the
// first time anything reads from the store; against a real Supabase project
// it's a no-op passthrough (seeding a production database automatically
// would be surprising and wrong).
// ---------------------------------------------------------------------------

import { getRepository, isDemoMode, Repository } from "./index";
import { seedDemoData } from "@/lib/seed/seed";

let seedingPromise: Promise<void> | null = null;

export async function getReadyRepository(): Promise<Repository> {
  if (isDemoMode()) {
    if (!seedingPromise) seedingPromise = seedDemoData();
    await seedingPromise;
  }
  return getRepository();
}
