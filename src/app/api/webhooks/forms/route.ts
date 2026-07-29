import { after } from "next/server";

import { buildFormsIntakeMessage, buildReturningLeadMessage } from "@/agent/automation";
import { runAgentTurn, type DomainToolResult } from "@/agent/run-turn";
import { extractPhoneForDedup } from "@/agent/tools/ingest-lead";
import { moveStage } from "@/agent/tools/shared";
import { supabaseAdmin } from "@/lib/supabase/server";
import { STAGE_RANK, type Lead } from "@/lib/supabase/types";
import { markWebhookEventDone, recordWebhookEvent } from "@/lib/webhooks";

/**
 * Google Form intake webhook.
 *
 * A Google Apps Script `onFormSubmit` trigger (see docs/apps-script) POSTs
 * flat JSON here on every real form submission. The body is deliberately
 * shaped to match `FIELD_ALIASES` in `src/agent/tools/ingest-lead.ts` --
 * full_name / phone / reason -- so the existing deterministic parser needs
 * zero changes to handle a genuinely new form.
 *
 * No browser is waiting on this request, so the actual agent run happens in
 * `after()`: ack fast, do the real work after responding, bounded by the
 * same maxDuration the chat route already needs a qualifying Vercel plan
 * for. Every outcome -- success or failure -- is written to
 * `webhook_events` so a run with nobody watching is still inspectable.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

function extractLeadId(toolResults: DomainToolResult[]): string | null {
  for (const result of toolResults) {
    if (result.name !== "ingest_lead") continue;
    const output = result.output as { lead_id?: unknown } | null;
    if (output && typeof output.lead_id === "string") return output.lead_id;
  }
  return null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-pulseline-webhook-secret");
  const expected = process.env.FORMS_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const campaignId =
    (typeof body.campaign_id === "string" && body.campaign_id) ||
    process.env.LIVE_DEMO_CAMPAIGN_ID;
  if (!campaignId) {
    return Response.json(
      { error: "campaign_id is required (or set LIVE_DEMO_CAMPAIGN_ID)." },
      { status: 400 },
    );
  }

  const dedupKey =
    (typeof body.response_id === "string" && body.response_id) || JSON.stringify(body);

  const { event, isDuplicate } = await recordWebhookEvent({
    source: "forms",
    dedupKey,
    payload: body,
  });

  if (isDuplicate) {
    return Response.json(
      { ok: true, duplicate: true, event_id: event.id, lead_id: event.lead_id, status: event.status },
      { status: 200 },
    );
  }

  // Same phone, same campaign: this is the same person coming back (a new
  // concern, a follow-up, booking again), not a new lead. One card per
  // person per campaign, appended to rather than duplicated -- a repeat
  // booking becomes a second real stage transition on the same lead (see
  // below), which is what lets the UI show every date they've booked.
  const db = supabaseAdmin();
  const phone = extractPhoneForDedup(body);
  let existingLead: Lead | null = null;
  if (phone) {
    const { data } = await db
      .from("leads")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("parsed->>phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingLead = (data as Lead | null) ?? null;
  }

  let sessionId =
    (typeof body.session_id === "string" && body.session_id) || crypto.randomUUID();

  if (existingLead) {
    sessionId = existingLead.agent_session_id ?? sessionId;
    await db
      .from("leads")
      .update({ raw_payload: body, agent_session_id: sessionId })
      .eq("id", existingLead.id);

    // Reset an already-worked lead back into active conversation so the next
    // draft_followup / log_kpi_event cycle produces a genuine stage
    // transition -- if we left it at 'booked', a second booking would look
    // like a no-op move and never get its own stage_events row.
    if (STAGE_RANK[existingLead.stage] >= STAGE_RANK.contacted || existingLead.stage === "lost") {
      await moveStage(existingLead, "contacted");
    }
  }

  after(async () => {
    const message = existingLead
      ? buildReturningLeadMessage({
          leadId: existingLead.id,
          campaignId,
          priorStage: existingLead.stage,
          rawPayload: body,
        })
      : buildFormsIntakeMessage({ campaignId, rawPayload: body });
    try {
      const result = await runAgentTurn({
        sessionId,
        message,
        source: "system",
        recursionLimit: 60,
      });

      const leadId = existingLead?.id ?? extractLeadId(result.toolResults);
      if (leadId && !existingLead) {
        await supabaseAdmin().from("leads").update({ agent_session_id: sessionId }).eq("id", leadId);
      }

      await markWebhookEventDone(event.id, { leadId, ok: result.ok, error: result.error });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[webhooks/forms] automated run failed:", detail);
      await markWebhookEventDone(event.id, { leadId: existingLead?.id ?? null, ok: false, error: detail });
    }
  });

  return Response.json(
    {
      ok: true,
      event_id: event.id,
      session_id: sessionId,
      status: "queued",
      returning_lead: existingLead?.id ?? null,
    },
    { status: 202 },
  );
}
