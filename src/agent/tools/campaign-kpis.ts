import { tool } from "langchain";
import * as z from "zod";

import { supabaseAdmin } from "@/lib/supabase/server";
import type { CampaignKpis } from "@/lib/supabase/types";
import { toolResult } from "./shared";

/**
 * Read-only KPI access.
 *
 * `log_kpi_event` returns KPIs too, but only as a side effect of moving a
 * lead. The campaign-analyst subagent needs to report on performance without
 * mutating the pipeline, so it needs a read path of its own.
 */
export const getCampaignKpis = tool(
  async ({ campaign_id }) => {
    let query = supabaseAdmin().from("campaign_kpis").select("*");
    if (campaign_id) query = query.eq("campaign_id", campaign_id);

    const { data, error } = await query.order("practice_name");

    if (error) {
      return toolResult({ ok: false, error: `KPI read failed: ${error.message}` });
    }

    const rows = (data ?? []) as CampaignKpis[];

    return toolResult({
      ok: true,
      count: rows.length,
      campaigns: rows,
      metric_definitions: {
        cost_per_lead: "ad spend / total leads",
        conversion_rate_pct: "share of leads that replied to outreach",
        booked_visit_rate_pct: "share of leads that became an appointment",
        cost_per_booking:
          "ad spend / booked visits — the figure the practice actually cares about",
      },
    });
  },
  {
    name: "get_campaign_kpis",
    description:
      "Read current performance for one campaign or all of them: spend, lead " +
      "counts by stage, cost per lead, conversion rate, booked-visit rate, and " +
      "cost per booked visit. Read-only. All figures are derived from the live " +
      "pipeline at call time, so they are never stale.",
    schema: z.object({
      campaign_id: z
        .string()
        .uuid()
        .optional()
        .describe("Omit to get every campaign."),
    }),
  },
);
