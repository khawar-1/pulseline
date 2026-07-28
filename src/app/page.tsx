import { Workspace } from "@/components/workspace";
import { EMPTY_SNAPSHOT, fetchSnapshot, type Snapshot } from "@/lib/snapshot";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * The pipeline is live data that the agent mutates, so there is nothing here
 * worth caching between requests. Server-rendering the first snapshot means the
 * panel is populated on first paint rather than flashing empty while the client
 * connects.
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  let snapshot: Snapshot = EMPTY_SNAPSHOT;
  let loadError: string | null = null;

  try {
    snapshot = await fetchSnapshot(supabaseBrowser());
  } catch (error) {
    // A missing or misconfigured database should degrade to a usable page with
    // a legible reason, not a 500 on a URL someone is reviewing.
    loadError =
      error instanceof Error
        ? error.message
        : "Could not reach Supabase. Check the environment variables.";
  }

  return <Workspace initial={snapshot} loadError={loadError} />;
}
