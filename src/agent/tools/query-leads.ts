import { tool } from "langchain";
import * as z from "zod";

import { supabaseAdmin } from "@/lib/supabase/server";
import { PRACTICE_TYPES, STAGES, type Lead } from "@/lib/supabase/types";
import { toolResult } from "./shared";

/**
 * The agent's entry point into the pipeline.
 *
 * Not in the original tool spec, but without it the agent has no way to
 * discover a lead id and therefore cannot answer the account manager's first
 * question of the day: "what should I work on?". Every other tool takes a
 * lead_id, so something has to produce one.
 *
 * Returns a trimmed projection rather than whole rows — raw_payload can be
 * several KB per lead and would blow up context on a 20-row result.
 */
export const queryLeads = tool(
  async ({ campaign_id, stage, practice_type, min_score, needs_work, order_by, limit }) => {
    let query = supabaseAdmin()
      .from("leads")
      .select("id, campaign_id, parsed, score, score_reasoning, stage, created_at, campaigns!inner(practice_name, practice_type)");

    if (campaign_id) query = query.eq("campaign_id", campaign_id);
    if (stage) query = query.eq("stage", stage);
    if (practice_type) query = query.eq("campaigns.practice_type", practice_type);
    if (typeof min_score === "number") query = query.gte("score", min_score);

    // "Needs work" is the default working view: anything not yet parsed or
    // scored, plus anything scored but never contacted.
    if (needs_work) query = query.in("stage", ["new", "scored"]);

    // Default ("score") is the work-priority view: highest booking likelihood
    // first. That silently hides genuinely recent leads with a lower score
    // once there are more than `limit` higher-scored ones ahead of them — use
    // "recent" for any question about what just came in, the latest
    // submission, etc. The two are not interchangeable.
    query =
      order_by === "recent"
        ? query.order("created_at", { ascending: false })
        : query.order("score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });

    const { data, error } = await query.limit(limit ?? 15);

    if (error) {
      return toolResult({ ok: false, error: `Query failed: ${error.message}` });
    }

    const rows = (data ?? []) as unknown as Array<
      Pick<Lead, "id" | "campaign_id" | "parsed" | "score" | "score_reasoning" | "stage" | "created_at"> & {
        campaigns: { practice_name: string; practice_type: string };
      }
    >;

    return toolResult({
      ok: true,
      count: rows.length,
      leads: rows.map((row) => ({
        lead_id: row.id,
        campaign_id: row.campaign_id,
        practice: row.campaigns?.practice_name ?? null,
        practice_type: row.campaigns?.practice_type ?? null,
        stage: row.stage,
        score: row.score,
        // A null score means either "not scored yet" or "escalated, no
        // score is meaningful" (see score_lead) -- expose the flag directly
        // so a caller doesn't have to guess which from score alone.
        needs_human_review: row.parsed?.needs_human_review ?? null,
        // Name and reason only. Enough to triage, without pulling the whole
        // parsed blob or the raw form payload into context.
        name: row.parsed?.full_name ?? null,
        reason: row.parsed?.reason ?? null,
        is_parsed: row.parsed !== null,
        created_at: row.created_at,
      })),
    });
  },
  {
    name: "query_leads",
    description:
      "Find leads in the pipeline. Use this first to discover lead ids before " +
      "calling any other lead tool. Set needs_work=true to get leads that are " +
      "not yet parsed, scored, or contacted — that is the normal starting " +
      "point for a working session. Returns a summary projection, not full " +
      "records; use it to pick leads, then act on them by id.",
    schema: z.object({
      campaign_id: z.string().uuid().optional().describe("Restrict to one campaign."),
      stage: z.enum(STAGES).optional().describe("Exact pipeline stage."),
      practice_type: z
        .enum(PRACTICE_TYPES)
        .optional()
        .describe("Restrict to one specialty."),
      min_score: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Only leads scored at or above this value."),
      needs_work: z
        .boolean()
        .optional()
        .describe("Only leads still at 'new' or 'scored', i.e. not yet contacted."),
      order_by: z
        .enum(["score", "recent"])
        .optional()
        .describe(
          "'score' (default) is the work-priority view, highest first — use for 'what " +
            "should I work on'. 'recent' sorts by created_at descending — use for any " +
            "'most recent' / 'latest' / 'just came in' question. These give different " +
            "results and are not interchangeable.",
        ),
      limit: z.number().min(1).max(50).optional().describe("Default 15."),
    }),
  },
);
