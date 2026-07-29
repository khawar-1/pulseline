/**
 * Instruction text for webhook-triggered turns.
 *
 * A webhook run is not a different code path from a human typing into the
 * console -- it is the same `runAgentTurn` call with a system-authored
 * message instead of one the account manager typed. These builders are the
 * only place that message text lives, so the two automated entry points
 * (`src/app/api/webhooks/forms`, `src/app/api/webhooks/twilio`) stay thin.
 */

const SYSTEM_TRIGGER_TAG = "[SYSTEM-TRIGGERED — no human is present in this session]";

export function buildFormsIntakeMessage(input: {
  campaignId: string;
  rawPayload: Record<string, unknown>;
}): string {
  return `${SYSTEM_TRIGGER_TAG}

A new lead just came in through the live Google Form webhook for campaign ${input.campaignId}.
Raw submission:
${JSON.stringify(input.rawPayload, null, 2)}

Call ingest_lead with campaign_id="${input.campaignId}" and this raw_payload to create and parse
it. Then read the relevant practice playbook, score it, and -- if it is worth contacting --
draft a WhatsApp message, send it to the compliance-reviewer subagent, then call draft_followup
with channel="whatsapp". draft_followup sends the message automatically once compliance clears;
there is no separate send step. If the lead needs human review or scoring says it is not worth
contacting, say so plainly in your final summary and stop.`;
}

export function buildReturningLeadMessage(input: {
  leadId: string;
  campaignId: string;
  priorStage: string;
  rawPayload: Record<string, unknown>;
}): string {
  return `${SYSTEM_TRIGGER_TAG}

A new Google Form submission just came in whose phone number matches an existing lead in this
same campaign: lead_id=${input.leadId} (it was previously at stage "${input.priorStage}"). This is
the same person coming back, not a new person -- do not create a second lead for them.

The new submission's raw text:
${JSON.stringify(input.rawPayload, null, 2)}

This lead's raw_payload has already been updated to the text above and its stage has been reset to
"contacted" so it can move through the pipeline again. Call ingest_lead with lead_id="${input.leadId}"
(NOT campaign_id + raw_payload) to re-parse it in place, read the relevant practice playbook, score
it again, and -- if it is worth contacting -- draft a WhatsApp message through the compliance-reviewer
subagent and call draft_followup with channel="whatsapp". If their reply indicates they want to book
again, call log_kpi_event to move them to booked -- this will be recorded as a new stage transition
on their existing lead, so the card shows every time they've booked, not just the most recent one.`;
}

export function buildInboundReplyMessage(input: {
  leadId: string;
  replyBody: string;
}): string {
  return `${SYSTEM_TRIGGER_TAG}

Lead ${input.leadId} just replied on WhatsApp:
"${input.replyBody}"

Look up this lead (query_leads or its existing record) and decide the appropriate compliant next
message. Send your draft to the compliance-reviewer subagent, then call draft_followup with
channel="whatsapp" if a reply is warranted -- it will send automatically once compliance clears.
If the reply indicates they want to book, or have already booked, also call log_kpi_event to move
the stage. If the reply describes acute symptoms, follow the hard-stop rule: draft nothing,
escalate to a human, and say so plainly in your final summary.`;
}
