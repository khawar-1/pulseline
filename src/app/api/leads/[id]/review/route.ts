import { fetchLead } from "@/agent/tools/shared";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Clears needs_human_review after a person has actually handled the lead.
 *
 * The flag itself is set by score_lead when a submission describes acute
 * symptoms, and draft_followup hard-refuses to send anything while it's set
 * -- that detection logic is untouched here. This route only adds the step
 * that was missing: an acknowledgement that a human looked at it, called the
 * patient, or handed it to clinical staff, so the badge can clear. Nothing
 * clears it automatically; this is the only way it goes away.
 */
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const lead = await fetchLead(id);
  if (!lead) return Response.json({ error: `No lead found with id ${id}.` }, { status: 404 });
  if (!lead.parsed) {
    return Response.json({ error: "Lead has not been parsed yet." }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("leads")
    .update({ parsed: { ...lead.parsed, needs_human_review: false } })
    .eq("id", id);

  if (error) {
    return Response.json({ error: `Failed to update lead: ${error.message}` }, { status: 500 });
  }

  return Response.json({ ok: true });
}
