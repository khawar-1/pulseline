/**
 * Hand-maintained mirror of supabase/schema.sql.
 *
 * Kept by hand rather than generated because the schema is small and stable,
 * and generating requires a live project + linked CLI, which would put a
 * network dependency in the build.
 */

export const STAGES = [
  "new",
  "scored",
  "contacted",
  "responded",
  "booked",
  "lost",
] as const;
export type Stage = (typeof STAGES)[number];

export const PRACTICE_TYPES = [
  "dermatology",
  "pediatrics",
  "cardiology",
] as const;
export type PracticeType = (typeof PRACTICE_TYPES)[number];

export const AD_SOURCES = ["google_search", "meta_feed"] as const;
export type AdSource = (typeof AD_SOURCES)[number];

export const CHANNELS = ["sms", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

export type ComplianceVerdict = "pass" | "revised";

/**
 * Ordering used to answer "has this lead reached at least stage X". Mirrors the
 * CASE expression in the campaign_kpis view; `lost` is terminal-negative and is
 * deliberately outside the progression.
 */
export const STAGE_RANK: Record<Stage, number> = {
  new: 0,
  scored: 1,
  contacted: 2,
  responded: 3,
  booked: 4,
  lost: -1,
};

export interface Campaign {
  id: string;
  practice_name: string;
  practice_type: PracticeType;
  ad_source: AdSource;
  spend: number;
  created_at: string;
}

/** Structured fields ingest_lead extracts out of the raw ad-form payload. */
export interface ParsedLead {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  reason: string | null;
  intent: string | null;
  insurance: string | null;
  preferred_time: string | null;
  deadline: string | null;
  referred_by: string | null;
  /** Pediatrics: the form is submitted by a parent, not the patient. */
  patient_is_requester: boolean | null;
  child_age: number | null;
  urgency_signals: string[];
  disqualifying_signals: string[];
  contact_completeness: "full" | "email only" | "phone only" | "none";
  /**
   * Set by score_lead when the submission describes acute symptoms.
   * draft_followup refuses to write outreach for these leads — the escalation
   * has to be enforced by data, not by the model remembering to be careful.
   */
  needs_human_review: boolean | null;
}

export interface Lead {
  id: string;
  campaign_id: string;
  raw_payload: Record<string, unknown>;
  parsed: ParsedLead | null;
  score: number | null;
  score_reasoning: string | null;
  stage: Stage;
  created_at: string;
  updated_at: string;
}

export interface Followup {
  id: string;
  lead_id: string;
  channel: Channel;
  content: string;
  compliance_verdict: ComplianceVerdict | null;
  compliance_notes: string | null;
  sent_at: string;
}

export interface StageEvent {
  id: string;
  lead_id: string;
  campaign_id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "tool";
  content: unknown;
  created_at: string;
}

/** One row of the campaign_kpis view. */
export interface CampaignKpis {
  campaign_id: string;
  practice_name: string;
  practice_type: PracticeType;
  ad_source: AdSource;
  spend: number;
  leads_total: number;
  leads_contacted: number;
  leads_responded: number;
  leads_booked: number;
  leads_lost: number;
  cost_per_lead: number | null;
  conversion_rate_pct: number | null;
  booked_visit_rate_pct: number | null;
  cost_per_booking: number | null;
}
