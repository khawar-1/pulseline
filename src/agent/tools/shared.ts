import { supabaseAdmin } from "@/lib/supabase/server";
import {
  STAGE_RANK,
  type Campaign,
  type Channel,
  type Lead,
  type Stage,
} from "@/lib/supabase/types";

/** Tools return compact JSON strings so tool results stay cheap in context. */
export function toolResult(value: unknown): string {
  return JSON.stringify(value);
}

export function toolError(message: string, extra?: Record<string, unknown>) {
  return toolResult({ ok: false, error: message, ...extra });
}

export async function fetchLead(leadId: string): Promise<Lead | null> {
  const { data, error } = await supabaseAdmin()
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load lead ${leadId}: ${error.message}`);
  return (data as Lead) ?? null;
}

export async function fetchCampaign(campaignId: string): Promise<Campaign | null> {
  const { data, error } = await supabaseAdmin()
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load campaign ${campaignId}: ${error.message}`);
  }
  return (data as Campaign) ?? null;
}

/**
 * Move a lead to a new stage and append the audit event, in that order.
 *
 * Stage changes are only ever written through here so `stage_events` can never
 * silently disagree with `leads.stage`. Backwards moves are allowed (a booked
 * visit can cancel), but a no-op move is rejected rather than logged, to keep
 * the event history meaningful.
 */
export async function moveStage(
  lead: Lead,
  toStage: Stage,
): Promise<{ moved: boolean; from: Stage; to: Stage }> {
  if (lead.stage === toStage) {
    return { moved: false, from: lead.stage, to: toStage };
  }

  const db = supabaseAdmin();

  const { error: updateError } = await db
    .from("leads")
    .update({ stage: toStage })
    .eq("id", lead.id);

  if (updateError) {
    throw new Error(
      `Failed to move lead ${lead.id} to ${toStage}: ${updateError.message}`,
    );
  }

  const { error: eventError } = await db.from("stage_events").insert({
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    from_stage: lead.stage,
    to_stage: toStage,
  });

  if (eventError) {
    throw new Error(
      `Lead ${lead.id} moved to ${toStage} but the stage event failed to write: ${eventError.message}`,
    );
  }

  return { moved: true, from: lead.stage, to: toStage };
}

/** Only advance a lead; never drag it backwards as a side effect of a tool. */
export function shouldAdvanceTo(current: Stage, target: Stage): boolean {
  return STAGE_RANK[target] > STAGE_RANK[current];
}

/** Best-effort E.164 for US numbers. Returns null when there aren't enough digits. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 7 ? `+${digits}` : null;
}

// ---------------------------------------------------------------------------
// Deterministic compliance lint
//
// This is the second half of a two-layer guard. The compliance-reviewer
// subagent catches nuance and rewrites; this catches the specific phrasings
// that are never acceptable, and it runs inside draft_followup itself so a
// violating message cannot reach the database even if the model skipped or
// rubber-stamped the review step.
//
// Deliberately narrow. A linter that fires on borderline wording would train
// the agent to fight it; these patterns map to concrete rules in
// knowledge/compliance.md and each one is a genuine violation.
// ---------------------------------------------------------------------------

interface LintRule {
  rule: string;
  pattern: RegExp;
  why: string;
}

const LINT_RULES: LintRule[] = [
  // Rule 1 — clinical advice, interpretation, reassurance
  {
    rule: "Rule 1 (no clinical advice)",
    pattern: /\b(don'?t|do not|no need to)\s+worry\b|nothing to worry about/i,
    why: "Reassurance about a medical concern is a clinical judgment made without an exam.",
  },
  {
    rule: "Rule 1 (no clinical advice)",
    pattern: /\bsounds like (you|your|it'?s|a case of|the)\b|\bthat'?s (probably|likely)\b|\bit'?s probably\b/i,
    why: "Speculating about what the patient's description means is diagnosis.",
  },
  {
    rule: "Rule 1 (no clinical advice)",
    pattern: /\b(we can|we'?ll|our \w+ can) (clear|cure|fix|treat) (that|this|it)\b/i,
    why: "Promising a treatment result before an evaluation is both clinical advice and an outcome claim.",
  },
  // Rule 1 — triage
  {
    rule: "Rule 1 (never triage)",
    pattern: /\b(emergency room|urgent care|call 911|go to the ER)\b|\bseek immediate\b/i,
    why: "Directing a patient toward or away from emergency care is triage. Escalate to a human instead.",
  },
  {
    rule: "Rule 1 (never triage)",
    pattern: /\b(can|should) (safely )?wait\b|\bnot urgent\b|\bno rush on (that|this)\b/i,
    why: "Telling a patient their concern can wait is triage.",
  },
  // Rule 3 — promises about outcome, coverage, price
  {
    rule: "Rule 3 (no promises)",
    pattern: /\bguarantee(d|s)?\b/i,
    why: "Nothing about a medical visit or its billing may be guaranteed.",
  },
  {
    rule: "Rule 3 (no promises)",
    pattern: /\byou'?ll (be )?(feel|feeling|look|looking) (better|great|amazing)\b/i,
    why: "Outcome promise.",
  },
  {
    rule: "Rule 3 (no promises)",
    pattern: /\b(will be|is|should be|fully) covered\b|\byour insurance will (cover|pay)\b/i,
    why: "Individual coverage depends on the plan and deductible. State network participation instead: 'We are in network with X'.",
  },
  // Rule 4 — manufactured urgency
  {
    rule: "Rule 4 (no manufactured urgency)",
    pattern: /\bonly \d+ (slots?|spots?|appointments?)\b|\blimited (time|availability|spots)\b|\bact (now|fast)\b/i,
    why: "Scarcity marketing applied to a medical decision.",
  },
  {
    rule: "Rule 4 (no manufactured urgency)",
    pattern: /\bdon'?t wait\b|\bbefore it gets worse\b|\bcould get worse\b/i,
    why: "Implying clinical risk in order to drive a booking.",
  },
];

export interface LintViolation {
  rule: string;
  matched: string;
  why: string;
}

/** SMS and WhatsApp both need opt-out language; each gets its own length cap. */
const CHANNEL_REQUIRES_OPT_OUT: Record<Channel, boolean> = {
  sms: true,
  whatsapp: true,
  email: false,
};
const CHANNEL_MAX_LENGTH: Record<Channel, number | null> = {
  sms: 320,
  whatsapp: 1000,
  email: null,
};

/**
 * Check a drafted message against the non-negotiable rules.
 * Returns every violation found so the agent can fix them in one pass.
 */
export function lintMessage(
  content: string,
  channel: Channel,
): LintViolation[] {
  const violations: LintViolation[] = [];

  for (const { rule, pattern, why } of LINT_RULES) {
    const match = content.match(pattern);
    if (match) {
      violations.push({ rule, matched: match[0], why });
    }
  }

  if (CHANNEL_REQUIRES_OPT_OUT[channel] && !/\bstop\b/i.test(content)) {
    violations.push({
      rule: "Rule 5 (channel requirements)",
      matched: "(missing)",
      why: `${channel.toUpperCase()} must carry opt-out language, e.g. 'Reply STOP to opt out'.`,
    });
  }

  const maxLength = CHANNEL_MAX_LENGTH[channel];
  if (maxLength !== null && content.length > maxLength) {
    violations.push({
      rule: "Rule 5 (channel requirements)",
      matched: `${content.length} characters`,
      why: `${channel.toUpperCase()} must stay at or under ${maxLength} characters.`,
    });
  }

  return violations;
}
