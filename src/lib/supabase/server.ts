import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS, so it must never reach the
 * browser — the guard below turns that mistake into a loud failure instead of
 * a leaked key.
 *
 * (The `server-only` package would catch this at build time, but it throws when
 * imported outside Next's react-server condition, which would break the
 * headless verification script. The runtime guard works in both.)
 *
 * Every write in Pulseline goes through here: agent tools run server-side in
 * route handlers, and the browser holds only the anon key with read-only
 * policies.
 */

let client: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill in your Supabase credentials.`,
    );
  }
  return value;
}

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "supabaseAdmin() was called in the browser. The service-role key must never " +
        "leave the server — use supabaseBrowser() from lib/supabase/client instead.",
    );
  }

  if (client) return client;

  client = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  return client;
}
