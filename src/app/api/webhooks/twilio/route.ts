import { after } from "next/server";

import { buildInboundReplyMessage } from "@/agent/automation";
import { runAgentTurn } from "@/agent/run-turn";
import { moveStage, normalizePhone, shouldAdvanceTo } from "@/agent/tools/shared";
import { isValidTwilioRequest } from "@/lib/twilio";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Lead } from "@/lib/supabase/types";
import { markWebhookEventDone, markWebhookEventSkipped, recordWebhookEvent } from "@/lib/webhooks";

/**
 * Twilio inbound-WhatsApp webhook.
 *
 * Twilio POSTs form-encoded fields (From, Body, MessageSid, ...) here every
 * time a patient replies. The reply is recorded and the stage advanced
 * synchronously -- deterministic, not model-dependent, the same pattern
 * `log_kpi_event` already uses for stage moves -- and the agent's own
 * compliant next message is drafted afterwards in `after()`, through the
 * identical draft_followup compliance gate a human-triggered turn goes
 * through. This route never sends a message itself; it only ever acks
 * Twilio with empty TwiML.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

function twimlResponse(status = 200) {
  return new Response(EMPTY_TWIML, { status, headers: { "Content-Type": "text/xml" } });
}

/**
 * Which lead an inbound reply belongs to.
 *
 * Twilio's inbound payload carries a phone number and message text -- nothing
 * that identifies a campaign. Campaign attribution for a reply is therefore
 * only possible by walking backward from the phone number to a lead that
 * already exists, never forward from some campaign signal on the message
 * itself. Three tiers, most specific first:
 *
 *  1. Exactly one lead has this phone -> unambiguous.
 *  2. Multiple leads share this phone across different campaigns -> prefer
 *     the one under LIVE_DEMO_CAMPAIGN_ID, since that is where real inbound
 *     traffic lands during an actual demo run; the seeded campaigns exist to
 *     look populated, not to receive real replies.
 *  3. Still ambiguous -> the lead this number was most recently sent an
 *     outbound WhatsApp for, falling back to the most recently created lead
 *     with that phone.
 *
 * None of this helps a genuinely cold message -- a number with no lead at
 * all, replying to Pulseline's shared Sandbox number with no prior thread.
 * That case is unattributable by construction: the WhatsApp Sandbox gives
 * the whole app exactly one shared number, not one per campaign, so there is
 * no campaign-identifying signal anywhere in the message to fall back on.
 * Fixing that for real requires per-campaign senders (the full WhatsApp
 * Business API, same scope call already made for send/receive generally) --
 * not something more matching logic here can solve. State that plainly if
 * asked; it is a Sandbox limit, not a bug.
 */
async function findLeadForInboundReply(phone: string): Promise<Lead | null> {
  const db = supabaseAdmin();

  const { data: candidates, error } = await db
    .from("leads")
    .select("*")
    .eq("parsed->>phone", phone)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to look up leads for phone ${phone}: ${error.message}`);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] as Lead;

  const liveDemoCampaignId = process.env.LIVE_DEMO_CAMPAIGN_ID;
  const scoped = liveDemoCampaignId
    ? candidates.filter((lead) => (lead as Lead).campaign_id === liveDemoCampaignId)
    : [];
  if (scoped.length === 1) return scoped[0] as Lead;
  const pool = scoped.length > 0 ? scoped : candidates;

  const ids = pool.map((lead) => (lead as Lead).id);
  const { data: lastOutbound } = await db
    .from("followups")
    .select("lead_id")
    .in("lead_id", ids)
    .eq("channel", "whatsapp")
    .eq("direction", "outbound")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastOutbound) {
    const match = pool.find((lead) => (lead as Lead).id === lastOutbound.lead_id);
    if (match) return match as Lead;
  }

  return pool[0] as Lead;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) params[key] = String(value);

  const baseUrl = process.env.PUBLIC_BASE_URL;
  const signature = request.headers.get("x-twilio-signature");
  if (!baseUrl || !isValidTwilioRequest({ signature, url: `${baseUrl}/api/webhooks/twilio`, params })) {
    return new Response("Forbidden", { status: 403 });
  }

  const dedupKey = params.MessageSid;
  if (!dedupKey) return twimlResponse();

  const { event, isDuplicate } = await recordWebhookEvent({
    source: "twilio",
    dedupKey,
    payload: params,
  });
  if (isDuplicate) return twimlResponse();

  const phone = normalizePhone(params.From?.replace(/^whatsapp:/, ""));
  const lead = phone ? await findLeadForInboundReply(phone) : null;

  if (!lead) {
    await markWebhookEventSkipped(event.id, `No matching lead for phone ${phone ?? params.From ?? "unknown"}.`);
    return twimlResponse();
  }

  const db = supabaseAdmin();

  await db.from("followups").insert({
    lead_id: lead.id,
    channel: "whatsapp",
    direction: "inbound",
    content: params.Body ?? "",
    provider: "twilio",
    provider_message_id: params.MessageSid,
  });

  if (shouldAdvanceTo(lead.stage, "responded")) {
    await moveStage(lead, "responded");
  }

  const sessionId = lead.agent_session_id ?? crypto.randomUUID();
  if (!lead.agent_session_id) {
    await db.from("leads").update({ agent_session_id: sessionId }).eq("id", lead.id);
  }

  after(async () => {
    const message = buildInboundReplyMessage({ leadId: lead.id, replyBody: params.Body ?? "" });
    try {
      const result = await runAgentTurn({
        sessionId,
        message,
        source: "system",
        recursionLimit: 60,
      });
      await markWebhookEventDone(event.id, { leadId: lead.id, ok: result.ok, error: result.error });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[webhooks/twilio] automated run failed:", detail);
      await markWebhookEventDone(event.id, { leadId: lead.id, ok: false, error: detail });
    }
  });

  return twimlResponse();
}
