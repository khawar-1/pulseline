import { tool } from "langchain";
import * as z from "zod";

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ParsedLead } from "@/lib/supabase/types";
import {
  fetchCampaign,
  fetchLead,
  moveStage,
  shouldAdvanceTo,
  toolError,
  toolResult,
} from "./shared";

/**
 * Persist a booking-likelihood score.
 *
 * The judgment happens in the agent, which has the practice playbook open —
 * that is the whole point of mounting the playbooks in the VFS. This tool's
 * job is to make the judgment durable and to enforce the things a language
 * model is unreliable about:
 *
 *  - Ordering: a lead cannot be scored before it has been parsed.
 *  - Provenance: `playbook_signals` is required, so a score always carries the
 *    specific signals it was based on. A score with no cited signals is a
 *    number the account manager cannot audit or argue with.
 *  - Ceilings: two hard caps that hold regardless of how compelling the lead
 *    reads, applied in code because they are business rules, not opinions.
 */

/**
 * Caps that apply after the agent's score.
 *
 * A lead you cannot contact cannot book, no matter how strong the intent — an
 * unreachable 95 is a fiction that would sit at the top of the work queue all
 * day. And per the cardiology playbook, an uninsured lead for a high-cost
 * specialty belongs with a financial counselor, not in the scheduling queue.
 */
function applyCaps(
  score: number,
  parsed: ParsedLead,
  practiceType: string,
): { score: number; applied: string[] } {
  const applied: string[] = [];
  let capped = score;

  if (parsed.contact_completeness === "none" && capped > 35) {
    capped = 35;
    applied.push(
      "Capped at 35: no email and no phone number, so this lead cannot be contacted at all.",
    );
  }

  const uninsured = /\b(uninsured|no insurance|self.?pay|none)\b/i.test(
    parsed.insurance ?? "",
  );
  if (practiceType === "cardiology" && uninsured && capped > 45) {
    capped = 45;
    applied.push(
      "Capped at 45: uninsured cardiology lead. Per the cardiology playbook this routes to the practice financial counselor rather than to scheduling.",
    );
  }

  return { score: capped, applied };
}

export const scoreLead = tool(
  async ({
    lead_id,
    score,
    reasoning,
    playbook_signals,
    intent,
    deadline,
    disqualifying_signals,
    needs_human_review,
  }) => {
    const lead = await fetchLead(lead_id);
    if (!lead) return toolError(`No lead found with id ${lead_id}.`);

    if (!lead.parsed) {
      return toolError(
        `Lead ${lead_id} has not been parsed yet. Call ingest_lead on it first.`,
        { required_tool: "ingest_lead" },
      );
    }

    const campaign = await fetchCampaign(lead.campaign_id);
    if (!campaign) {
      return toolError(`Lead ${lead_id} points at a campaign that no longer exists.`);
    }

    const { score: finalScore, applied } = applyCaps(
      score,
      lead.parsed,
      campaign.practice_type,
    );

    // An escalated lead has no meaningful score per the playbook, so the
    // persisted value is forced to null in code rather than trusted to
    // whatever number the model submitted. That is what makes null mean
    // exclusively "not scored or escalated" everywhere downstream, and frees
    // every real number -- including 0 -- to mean an actual score again.
    const isEscalated = needs_human_review ?? false;
    const persistedScore = isEscalated ? null : finalScore;

    const parsed: ParsedLead = {
      ...lead.parsed,
      intent: intent ?? lead.parsed.intent,
      deadline: deadline ?? lead.parsed.deadline,
      urgency_signals: playbook_signals,
      disqualifying_signals: disqualifying_signals ?? [],
      // Persisted rather than just returned, so draft_followup can hard-block
      // on it later in the session.
      needs_human_review: needs_human_review ?? false,
    };

    const { error } = await supabaseAdmin()
      .from("leads")
      .update({ score: persistedScore, score_reasoning: reasoning, parsed })
      .eq("id", lead_id);

    if (error) return toolError(`Failed to save score: ${error.message}`);

    const advanced = shouldAdvanceTo(lead.stage, "scored")
      ? await moveStage(lead, "scored")
      : { moved: false, from: lead.stage, to: lead.stage };

    return toolResult({
      ok: true,
      lead_id,
      practice: campaign.practice_name,
      practice_type: campaign.practice_type,
      submitted_score: score,
      final_score: persistedScore,
      caps_applied: applied,
      stage: advanced.moved ? advanced.to : lead.stage,
      needs_human_review: needs_human_review ?? false,
      next_step: needs_human_review
        ? "Do NOT draft an outbound message. Report this lead to the account manager for human handling and explain why."
        : "If this lead is worth contacting, draft a follow-up, send it to the compliance-reviewer subagent, then persist it with draft_followup.",
    });
  },
  {
    name: "score_lead",
    description:
      "Record a 0-100 booking-likelihood score for a lead that has already " +
      "been parsed. Read the practice playbook for the campaign's specialty " +
      "before calling this, and cite the specific signals you used in " +
      "playbook_signals. Two hard caps are applied in code afterwards " +
      "(uncontactable leads, and uninsured cardiology leads), and the result " +
      "tells you if either fired. Set needs_human_review when the lead " +
      "describes acute symptoms — those must never receive an automated reply.",
    schema: z.object({
      lead_id: z.string().uuid(),
      score: z
        .number()
        .min(0)
        .max(100)
        .describe("Booking likelihood, 0-100, before code-level caps."),
      reasoning: z
        .string()
        .min(40)
        .describe(
          "Two or three sentences an account manager could act on. Say what " +
            "drives the score up and what holds it back.",
        ),
      playbook_signals: z
        .array(z.string())
        .min(1)
        .describe(
          "The specific signals from the practice playbook this score rests " +
            "on, e.g. 'hard external deadline: tryouts Aug 12'. Required.",
        ),
      intent: z
        .string()
        .optional()
        .describe("Short label, e.g. 'referral', 'cosmetic', 'price_shopping'."),
      deadline: z
        .string()
        .optional()
        .describe("Any date or event the lead is working against."),
      disqualifying_signals: z
        .array(z.string())
        .optional()
        .describe("Reasons this lead may not be workable at all."),
      needs_human_review: z
        .boolean()
        .optional()
        .describe(
          "True when the lead describes acute symptoms. Blocks automated outreach.",
        ),
    }),
  },
);
