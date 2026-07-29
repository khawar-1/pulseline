import * as z from "zod";

import { supabaseAdmin } from "@/lib/supabase/server";
import { AD_SOURCES, PRACTICE_TYPES } from "@/lib/supabase/types";

/**
 * Edit and delete for a single campaign — both human actions, not agent
 * tools, same reasoning as POST /api/campaigns: creating, correcting, or
 * retiring a campaign is an account-manager decision, not something the
 * agent should infer or do on its own initiative.
 */

const UpdateCampaignSchema = z.object({
  practice_name: z.string().trim().min(1).optional(),
  practice_type: z.enum(PRACTICE_TYPES).optional(),
  ad_source: z.enum(AD_SOURCES).optional(),
  spend: z.number().min(0).optional(),
  hours: z.string().trim().nullable().optional(),
  booking_url: z.string().trim().url().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid update", issues: parsed.error.issues }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("campaigns")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: `Failed to update campaign: ${error.message}` }, { status: 500 });
  }

  return Response.json({ ok: true, campaign: data });
}

/**
 * Cascades: leads, followups, and stage_events for this campaign all carry
 * `on delete cascade` in the schema, so this is a genuine, permanent, whole-
 * campaign delete — every lead and message under it goes with it. The
 * confirmation step (typing the practice name) lives in the frontend; this
 * route trusts that it was already shown, same as every other route in this
 * app trusts the browser only sends requests a human meant to send.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { error } = await supabaseAdmin().from("campaigns").delete().eq("id", id);

  if (error) {
    return Response.json({ error: `Failed to delete campaign: ${error.message}` }, { status: 500 });
  }

  return Response.json({ ok: true });
}
