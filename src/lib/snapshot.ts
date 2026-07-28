import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Campaign,
  CampaignKpis,
  Followup,
  Lead,
  StageEvent,
} from "@/lib/supabase/types";

/**
 * Everything the workspace renders, in one shot.
 *
 * The same function serves the server render (service-role client) and the
 * browser refresh (anon client, read-only under RLS) so there is exactly one
 * definition of "what the pipeline pane is looking at".
 *
 * The working set is small on purpose — three campaigns, a couple of dozen
 * leads — which is what makes the refetch-on-change strategy in
 * `use-pipeline.ts` viable.
 */
export interface Snapshot {
  campaigns: Campaign[];
  leads: Lead[];
  followups: Followup[];
  events: StageEvent[];
  kpis: CampaignKpis[];
  /**
   * When this read happened. Every relative timestamp in the pane is measured
   * against it rather than against `Date.now()`, so the server render and the
   * hydration that follows it produce identical text.
   */
  fetchedAt: number;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  campaigns: [],
  leads: [],
  followups: [],
  events: [],
  kpis: [],
  fetchedAt: 0,
};

/** Enough history for the pulse trace to have a rhythm without paging. */
const EVENT_LIMIT = 300;
const FOLLOWUP_LIMIT = 300;

export async function fetchSnapshot(db: SupabaseClient): Promise<Snapshot> {
  const [campaigns, leads, followups, events, kpis] = await Promise.all([
    db.from("campaigns").select("*").order("practice_name"),
    db.from("leads").select("*").order("created_at", { ascending: true }),
    db
      .from("followups")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(FOLLOWUP_LIMIT),
    db
      .from("stage_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(EVENT_LIMIT),
    db.from("campaign_kpis").select("*"),
  ]);

  const failure = [campaigns, leads, followups, events, kpis].find((r) => r.error);
  if (failure?.error) {
    throw new Error(`Could not load the pipeline: ${failure.error.message}`);
  }

  return {
    campaigns: (campaigns.data ?? []) as Campaign[],
    leads: (leads.data ?? []) as Lead[],
    followups: (followups.data ?? []) as Followup[],
    // Fetched newest-first so the limit keeps the *recent* history; the trace
    // wants it oldest-first, left to right.
    events: ((events.data ?? []) as StageEvent[]).slice().reverse(),
    kpis: (kpis.data ?? []) as CampaignKpis[],
    fetchedAt: Date.now(),
  };
}
