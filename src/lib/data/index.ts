// ---------------------------------------------------------------------------
// Repository factory. Chooses SupabaseRepository automatically when Supabase
// credentials are configured; otherwise falls back to InMemoryRepository so
// the app works fully out of the box in demo mode.
// ---------------------------------------------------------------------------

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { inMemoryRepository } from "./inMemoryRepository";
import { supabaseRepository } from "./supabaseRepository";
import { Repository } from "./repository";

export function getRepository(): Repository {
  if (isSupabaseConfigured()) return supabaseRepository;
  return inMemoryRepository;
}

export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

export * from "./repository";
