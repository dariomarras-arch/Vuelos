// ---------------------------------------------------------------------------
// Supabase client factory. Only instantiated when the required environment
// variables are present — see .env.example. Never import this directly from
// client components; it is used exclusively from server-side code (API
// routes, server components, the scheduler) via the Repository layer.
// ---------------------------------------------------------------------------

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
}

/**
 * Server-side Supabase client. Prefers the service role key (needed to
 * bypass RLS for the scheduler/cron jobs); falls back to the anon key for
 * environments that only expose that.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase no está configurado. Definí SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_ANON_KEY) en tu .env para usar persistencia real.",
    );
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cachedClient;
}
