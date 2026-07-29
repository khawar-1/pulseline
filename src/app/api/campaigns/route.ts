import * as z from "zod";

import { supabaseAdmin } from "@/lib/supabase/server";
import { AD_SOURCES, PRACTICE_TYPES } from "@/lib/supabase/types";

/**
 * Campaign creation for the account manager.
 *
 * Every other write in this app happens because the agent called a tool.
 * This is the one exception: a new campaign is a human decision (a practice
 * signed up, a new ad source needs tracking), not something the agent should
 * infer or create on its own initiative. Still goes through a server route
 * with the service-role client, same as every other mutation — the browser
 * never gets write access, campaign creation included.
 */

const CreateCampaignSchema = z.object({
  practice_name: z.string().trim().min(1, "Practice name is required."),
  practice_type: z.enum(PRACTICE_TYPES),
  ad_source: z.enum(AD_SOURCES),
  spend: z.number().min(0).optional(),
  hours: z.string().trim().min(1).optional(),
  booking_url: z.string().trim().url("booking_url must be a valid URL.").optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid campaign", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { practice_name, practice_type, ad_source, spend, hours, booking_url } = parsed.data;

  const { data, error } = await supabaseAdmin()
    .from("campaigns")
    .insert({
      practice_name,
      practice_type,
      ad_source,
      spend: spend ?? 0,
      hours: hours ?? null,
      booking_url: booking_url ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: `Failed to create campaign: ${error.message}` }, { status: 500 });
  }

  return Response.json({ ok: true, campaign: data }, { status: 201 });
}
