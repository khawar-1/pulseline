import { tool } from "langchain";
import * as z from "zod";

import { sendWhatsApp } from "@/lib/twilio";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CHANNELS } from "@/lib/supabase/types";
import {
  fetchLead,
  lintMessage,
  moveStage,
  shouldAdvanceTo,
  toolError,
  toolResult,
} from "./shared";

/**
 * Persist an outbound follow-up message — the only path by which a message
 * reaches a patient.
 *
 * Compliance is enforced here in three ways that do not depend on the model
 * choosing to cooperate:
 *
 *  1. `compliance_verdict` and `compliance_notes` are REQUIRED schema fields.
 *     There is no way to write a followup row without having produced a
 *     verdict, so the review step cannot be silently skipped. The notes have a
 *     minimum length so "looks fine" does not satisfy it.
 *
 *  2. A deterministic linter re-checks the final text against the rules that
 *     are never acceptable. If it fires, nothing is written and the violations
 *     come back for the agent to fix. This is the backstop for the case where
 *     the reviewer subagent rubber-stamps a bad draft.
 *
 *  3. Leads flagged `needs_human_review` at scoring time — the ones describing
 *     acute symptoms — are refused outright. A marketing agent is the wrong
 *     actor to answer those, and no wording makes it right.
 */
export const draftFollowup = tool(
  async ({ lead_id, channel, content, compliance_verdict, compliance_notes }) => {
    const lead = await fetchLead(lead_id);
    if (!lead) return toolError(`No lead found with id ${lead_id}.`);

    if (!lead.parsed) {
      return toolError(
        `Lead ${lead_id} has not been parsed. Call ingest_lead, then score_lead, before drafting.`,
        { required_tool: "ingest_lead" },
      );
    }

    // Guard 3 — acute symptom escalation. Hard stop. Checked before the
    // null-score guard below: escalated leads are persisted with score=null
    // on purpose (see score_lead), so if this ran second the generic
    // "not scored" error would mask the real reason and could send an
    // autonomous session down the wrong path (re-score-and-retry instead of
    // stop-and-escalate).
    if (lead.parsed.needs_human_review) {
      return toolError(
        `Lead ${lead_id} was flagged for human review because the submission describes ` +
          `acute symptoms. Automated outreach is not permitted on this lead. Report it ` +
          `to the account manager for a person to handle.`,
        { escalate_to_human: true },
      );
    }

    if (lead.score === null) {
      return toolError(
        `Lead ${lead_id} has not been scored. Call score_lead before drafting outreach.`,
        { required_tool: "score_lead" },
      );
    }

    // Guard 2 — deterministic lint. Nothing is written if this fires.
    const violations = lintMessage(content, channel);
    if (violations.length > 0) {
      return toolResult({
        ok: false,
        written: false,
        error:
          "The message violates the compliance rules and was not saved. Rewrite it " +
          "so it still asks the patient to schedule, then call draft_followup again.",
        violations,
        reference: "/knowledge/compliance.md",
      });
    }

    const { data, error } = await supabaseAdmin()
      .from("followups")
      .insert({
        lead_id,
        channel,
        direction: "outbound",
        content,
        compliance_verdict,
        compliance_notes,
      })
      .select("id")
      .single();

    if (error) return toolError(`Failed to save the follow-up: ${error.message}`);

    const followupId = (data as { id: string }).id;

    // Real send, atomic with the compliant write: no separate agent
    // decision, no approval step. Best-effort -- if Twilio is unconfigured
    // (local dev, npm run verify) or the API call fails, the row still
    // exists with dispatch_status recording what happened. The compliance
    // gate above is what is load-bearing; delivery is not.
    let dispatch: { status: "sent" | "failed" | "skipped"; providerMessageId?: string; error?: string } =
      { status: "skipped" };

    if (channel === "whatsapp") {
      const phone = lead.parsed?.phone ?? null;
      dispatch = phone
        ? await sendWhatsApp(phone, content)
        : { status: "skipped", error: "No phone number on file for this lead." };

      await supabaseAdmin()
        .from("followups")
        .update({
          provider: "twilio",
          provider_message_id: dispatch.providerMessageId ?? null,
          dispatch_status: dispatch.status,
          dispatch_error: dispatch.error ?? null,
        })
        .eq("id", followupId);
    }

    const advanced = shouldAdvanceTo(lead.stage, "contacted")
      ? await moveStage(lead, "contacted")
      : { moved: false, from: lead.stage, to: lead.stage };

    return toolResult({
      ok: true,
      written: true,
      followup_id: followupId,
      lead_id,
      channel,
      compliance_verdict,
      stage: advanced.moved ? advanced.to : lead.stage,
      characters: content.length,
      dispatch: channel === "whatsapp" ? dispatch : { status: "not_applicable" },
    });
  },
  {
    name: "draft_followup",
    description:
      "Save an outbound SMS, email, or WhatsApp follow-up for a scored lead and " +
      "move it to 'contacted'. Before calling this you MUST send your draft to " +
      "the compliance-reviewer subagent and pass through its verdict and notes " +
      "— they are required fields. The message is independently re-checked " +
      "here against the compliance rules; if it fails, nothing is saved and " +
      "you get the violations back to fix. For channel=whatsapp, once " +
      "compliance clears the message is sent automatically via Twilio if " +
      "configured — there is no separate send step. Reference specific " +
      "details the patient supplied, and always end with a concrete " +
      "scheduling ask.",
    schema: z.object({
      lead_id: z.string().uuid(),
      channel: z.enum(CHANNELS),
      content: z
        .string()
        .min(1)
        .describe(
          "The final approved message text, exactly as it will be sent. For " +
            "SMS keep it at or under 320 characters and include 'Reply STOP to " +
            "opt out'; for WhatsApp the same opt-out line is required, at or " +
            "under 1000 characters.",
        ),
      compliance_verdict: z
        .enum(["pass", "revised"])
        .describe(
          "From the compliance-reviewer subagent. 'pass' if the first draft " +
            "was clean, 'revised' if the reviewer had to change it.",
        ),
      compliance_notes: z
        .string()
        .min(20)
        .describe(
          "From the compliance-reviewer subagent. Which rules were checked, " +
            "and on a revision, exactly what changed and why.",
        ),
    }),
  },
);
