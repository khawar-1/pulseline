import { draftFollowup } from "./draft-followup";
import { getCampaignInfo } from "./campaign-info";
import { getCampaignKpis } from "./campaign-kpis";
import { ingestLead } from "./ingest-lead";
import { logKpiEvent } from "./log-kpi-event";
import { queryLeads } from "./query-leads";
import { scoreLead } from "./score-lead";

/**
 * The domain toolset. The Deep Agent harness adds its own built-ins on top of
 * these: `write_todos` for planning, the filesystem tools for the knowledge
 * base, and `task` for delegating to subagents.
 */
export const pulselineTools = [
  queryLeads,
  ingestLead,
  scoreLead,
  draftFollowup,
  logKpiEvent,
  getCampaignKpis,
  getCampaignInfo,
];

/** Read-only subset handed to the campaign-analyst subagent. */
export const analystTools = [queryLeads, getCampaignKpis];

export {
  queryLeads,
  ingestLead,
  scoreLead,
  draftFollowup,
  logKpiEvent,
  getCampaignKpis,
  getCampaignInfo,
};
