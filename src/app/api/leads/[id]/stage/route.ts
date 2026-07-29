import * as z from "zod";

import { fetchLead, moveStage } from "@/agent/tools/shared";
import { STAGES } from "@/lib/supabase/types";

/**
 * Manual stage override — for when a booking (or a loss, or a reply) happens
 * somewhere Pulseline can't see, like a phone call. The agent's own path to
 * `booked` is log_kpi_event, reached by reading a reply; this is the same
 * write (moveStage, the one place stage changes are allowed to happen) but
 * triggered by a human who knows something the pipeline doesn't.
 *
 * Unlike the agent's tools, this does not restrict moves to "forward only"
 * (see shouldAdvanceTo elsewhere) — a manual correction is exactly the case
 * where someone needs to move a lead backward, e.g. undoing a mis-click.
 */
const BodySchema = z.object({ to_stage: z.enum(STAGES) });

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
