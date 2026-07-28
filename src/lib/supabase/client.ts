import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Anon-key Supabase client — the read path.
 *
 * Used by the browser for the pipeline read and the Realtime subscription, and
 * by the server render for the initial snapshot. Deliberately the *same* client
 * in both places: the page you see on first paint comes through exactly the RLS
 * policies the browser is held to, so a policy mistake shows up immediately
 * rather than only after hydration.
 *
 * Writes never go through here. Every mutation runs server-side under the
 * service-role client in `server.ts`.
 */

let browserClient: SupabaseClient | null = null;

/**
 * Whether the anon credentials were present at build time. These are inlined
 * by Next, so this is a constant — cheap enough to read during render, which
 * lets the UI start in the right state instead of correcting itself after an
 * effect throws.
 */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function supabaseBrowser(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  // The browser keeps one client so there is a single Realtime socket. On the
  // server a fresh client per request avoids sharing state across requests.
  if (typeof window === "undefined") {
    return createClient(url, anonKey, { auth: { persistSession: false } });
  }

  browserClient ??= createClient(url, anonKey);
  return browserClient;
}
