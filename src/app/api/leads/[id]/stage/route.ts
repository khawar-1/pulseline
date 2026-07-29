import * as z from "zod";

import { fetchLead, moveStage } from "@/agent/tools/shared";

/**
 * Manual "mark as booked" — for when a booking happens somewhere Pulseline
 * can't see, like a phone call. Every other stage transition is the agent's
 * job (score_lead, draft_followup, and log_kpi_event reading a reply cover
 * new/scored/contacted/responded/lost) — booked is the one stage a human
 * can legitimately know about before the agent ever could, so it's the only
 * one this route accepts. Deliberately not a general stage-editor: giving
 * the account manager a free-form stage picker invites drift between what
 * the dashboard shows and what the agent's own bookkeeping believes.
 */
const BodySchema = z.object({ to_stage: z.literal("booked") });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const lead = await fetchLead(id);
  if (!lead) return Response.json({ error: `No lead found with id ${id}.` }, { status: 404 });

  const result = await moveStage(lead, parsed.data.to_stage);
  return Response.json({ ok: true, ...result });
}
