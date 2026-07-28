import type { SubAgent } from "deepagents";

import { CAMPAIGN_ANALYST_PROMPT, COMPLIANCE_REVIEWER_PROMPT } from "./prompts";
import { analystTools } from "./tools";

/**
 * Subagents are the workflow structure of this harness.
 *
 * The main agent delegates to them through the built-in `task` tool, and each
 * runs with an isolated context — it sees the task it was handed, not the
 * conversation that led there.
 *
 * That isolation is doing real work in the compliance case. A reviewer that had
 * watched the main agent reason its way to a draft would be predisposed to
 * approve it. One that only sees the text and the rules is not.
 */

export const complianceReviewer: SubAgent = {
  name: "compliance-reviewer",
  description:
    "Reviews a drafted patient message against the practice's compliance rules " +
    "and returns it approved or rewritten. Delegate here after drafting any SMS " +
    "or email and before calling draft_followup — pass the draft text, the " +
    "channel, and the details the patient supplied. Returns VERDICT, NOTES, and " +
    "the final MESSAGE to persist.",
  systemPrompt: COMPLIANCE_REVIEWER_PROMPT,
  // No domain tools: this subagent reads the rules and judges text. Giving it
  // database access would let it act on the pipeline, which is not its job.
};

export const campaignAnalyst: SubAgent = {
  name: "campaign-analyst",
  description:
    "Analyses campaign performance — cost per lead, conversion rate, " +
    "booked-visit rate, cost per booked visit — and writes a report to the " +
    "filesystem. Delegate here for anything about how campaigns are doing, " +
    "rather than pulling all the KPI data into your own context. Read-only.",
  systemPrompt: CAMPAIGN_ANALYST_PROMPT,
  tools: analystTools,
};

export const pulselineSubagents = [complianceReviewer, campaignAnalyst];
