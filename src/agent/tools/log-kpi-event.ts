import { tool } from "langchain";
import * as z from "zod";

import { supabaseAdmin } from "@/lib/supabase/server";
import { STAGES, type CampaignKpis } from "@/lib/supabase/types";
import { fetchLead, moveStage, toolError, toolResult } from "./shared";

/**
 * Record a pipeline stage change and return the campaign's recomputed KPIs.
 *
 * The brief specified `log_kpi_event(campaign_id, event_type)`. It takes
 * `lead_id` instead because an event is always *some lead* moving — with only
 * a campaign id there is nothing to write into stage_events, and the campaign
 * is derivable from the lead anyway.
 *
 * KPIs are read back from the `campaign_kpis` view rather than incremented
 * here. Deriving them from the current rows on every call means they cannot
 * drift out of sync with the pipeline, which is the standard failure mode of
 * maintaining counters alongside the data they count.
 */
export const logKpiEvent = tool(
  async ({ lead_id, to_stage, note }) => {
    const lead = await fetchLead(lead_id);
    if (!lead) return toolError(`No lead found with id ${lead_id}.`);

    const result = await moveStage(lead, to_stage);

    const { data, error } = await supabaseAdmin()
      .from("campaign_kpis")
      .select("*")
      .eq("campaign_id", lead.campaign_id)
      .maybeSingle();

    if (error) {
      return toolError(
        `Stage change was written but KPIs could not be read back: ${error.message}`,
      );
    }

    const kpis = data as CampaignKpis | null;

    return toolResult({
      ok: true,
      lead_id,
      campaign_id: lead.campaign_id,
      stage_change: result.moved
        ? { from: result.from, to: result.to, logged: true }
        : { from: result.from, to: result.to, logged: false, reason: "Lead was already at that stage." },
      note: note ?? null,
      campaign_kpis: kpis
        ? {
            practice: kpis.practice_name,
            spend: kpis.spend,
            leads_total: kpis.leads_total,
            leads_contacted: kpis.leads_contacted,
            leads_responded: kpis.leads_responded,
            leads_booked: kpis.leads_booked,
            leads_lost: kpis.leads_lost,
            cost_per_lead: kpis.cost_per_lead,
            conversion_rate_pct: kpis.conversion_rate_pct,
            booked_visit_rate_pct: kpis.booked_visit_rate_pct,
            cost_per_booking: kpis.cost_per_booking,
          }
        : null,
    });
  },
  {
    name: "log_kpi_event",
    description:
      "Move a lead to a new pipeline stage, write the stage-change event to " +
      "the audit log, and return the campaign's freshly recomputed KPIs (cost " +
      "per lead, conversion rate, booked-visit rate, cost per booking). Use " +
      "this when a lead replies, books, or is lost. Note that score_lead and " +
      "draft_followup already advance leads to 'scored' and 'contacted' on " +
      "their own, so you do not need to call this after them.",
    schema: z.object({
      lead_id: z.string().uuid(),
      to_stage: z.enum(STAGES).describe("The stage the lead is moving to."),
      note: z
        .string()
        .optional()
        .describe("Optional short context for the account manager."),
    }),
  },
);
