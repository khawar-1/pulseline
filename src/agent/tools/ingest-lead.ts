import { tool } from "langchain";
import * as z from "zod";

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ParsedLead } from "@/lib/supabase/types";
import { fetchLead, normalizePhone, toolError, toolResult } from "./shared";

/**
 * Turn a raw ad-form submission into structured fields.
 *
 * This tool is deliberately deterministic. Google and Meta both post a
 * `field_data` array of `{name, values}` pairs, but the field names differ per
 * form ("what_brings_you_in" vs "reason_for_visit", "insurance_provider" vs
 * "insurance"), values arrive as single-element arrays, and empty fields come
 * through as `[""]` rather than being absent. That is mechanical work with a
 * right answer, so it does not need a model — and doing it in code means the
 * parse is identical every run rather than varying with sampling.
 *
 * What it does NOT do is judgment: intent, urgency signals, and disqualifying
 * signals are left empty here and filled in by `score_lead`, where the agent
 * has read the practice playbook. Splitting the tools along the
 * deterministic/judgment line is the reason both are reliable.
 */

/** Form field names seen across both ad platforms, mapped to our canonical fields. */
const FIELD_ALIASES: Record<keyof CanonicalFields, string[]> = {
  full_name: ["full_name", "name", "your_name", "parent_name"],
  email: ["email", "email_address", "work_email"],
  phone: ["phone_number", "phone", "mobile_number", "contact_number"],
  reason: [
    "what_brings_you_in",
    "reason_for_visit",
    "reason",
    "how_can_we_help",
    "message",
  ],
  insurance: ["insurance_provider", "insurance", "insurance_carrier", "payer"],
  preferred_time: ["preferred_time", "availability", "best_time_to_call"],
  referred_by: ["referred_by", "referral", "referring_physician"],
  child_age: ["child_age", "patient_age", "age"],
};

interface CanonicalFields {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  reason: string | null;
  insurance: string | null;
  preferred_time: string | null;
  referred_by: string | null;
  child_age: string | null;
}

interface FieldDatum {
  name?: string;
  values?: unknown[];
}

/** Flatten `field_data` into a lowercase key -> first non-empty value map. */
function flattenFieldData(payload: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {};

  const fieldData = payload.field_data;
  if (Array.isArray(fieldData)) {
    for (const entry of fieldData as FieldDatum[]) {
      if (!entry?.name) continue;
      const value = Array.isArray(entry.values)
        ? entry.values.find((v) => typeof v === "string" && v.trim() !== "")
        : undefined;
      if (typeof value === "string") {
        flat[entry.name.toLowerCase().trim()] = value.trim();
      }
    }
  }

  // Some forms post flat top-level keys instead of a field_data array.
  for (const [key, value] of Object.entries(payload)) {
    if (key === "field_data") continue;
    if (typeof value === "string" && value.trim() !== "") {
      const lower = key.toLowerCase().trim();
      if (!(lower in flat)) flat[lower] = value.trim();
    }
  }

  return flat;
}

function pick(flat: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = flat[alias];
    if (value && value.trim() !== "") return value.trim();
  }
  return null;
}

function extract(payload: Record<string, unknown>): CanonicalFields {
  const flat = flattenFieldData(payload);
  return {
    full_name: pick(flat, FIELD_ALIASES.full_name),
    email: pick(flat, FIELD_ALIASES.email),
    phone: pick(flat, FIELD_ALIASES.phone),
    reason: pick(flat, FIELD_ALIASES.reason),
    insurance: pick(flat, FIELD_ALIASES.insurance),
    preferred_time: pick(flat, FIELD_ALIASES.preferred_time),
    referred_by: pick(flat, FIELD_ALIASES.referred_by),
    child_age: pick(flat, FIELD_ALIASES.child_age),
  };
}

function contactCompleteness(
  email: string | null,
  phone: string | null,
): ParsedLead["contact_completeness"] {
  if (email && phone) return "full";
  if (email) return "email only";
  if (phone) return "phone only";
  return "none";
}

function buildParsed(payload: Record<string, unknown>): ParsedLead {
  const fields = extract(payload);
  const phone = normalizePhone(fields.phone);
  const email = fields.email?.includes("@") ? fields.email : null;
  const childAge = fields.child_age ? Number.parseInt(fields.child_age, 10) : null;

  return {
    full_name: fields.full_name,
    email,
    phone,
    reason: fields.reason,
    insurance: fields.insurance,
    preferred_time: fields.preferred_time,
    referred_by: fields.referred_by,
    child_age: Number.isFinite(childAge) ? childAge : null,
    // Filled in by score_lead once the agent has read the playbook.
    intent: null,
    deadline: null,
    patient_is_requester: null,
    urgency_signals: [],
    disqualifying_signals: [],
    needs_human_review: null,
    contact_completeness: contactCompleteness(email, phone),
  };
}

export const ingestLead = tool(
  async ({ lead_id, campaign_id, raw_payload }) => {
    const db = supabaseAdmin();

    // Mode 1: parse a lead that is already in the pipeline.
    if (lead_id) {
      const lead = await fetchLead(lead_id);
      if (!lead) return toolError(`No lead found with id ${lead_id}.`);

      const parsed = buildParsed(lead.raw_payload);
      const { error } = await db
        .from("leads")
        .update({ parsed })
        .eq("id", lead_id);

      if (error) {
        return toolError(`Failed to save parsed fields: ${error.message}`);
      }

      return toolResult({
        ok: true,
        lead_id,
        campaign_id: lead.campaign_id,
        stage: lead.stage,
        parsed,
        next_step:
          "Read the practice playbook for this campaign's specialty, then call " +
          "score_lead with a score, reasoning, and the urgency or disqualifying " +
          "signals you identified.",
      });
    }

    // Mode 2: a brand new inbound submission that is not in the database yet.
    if (!campaign_id || !raw_payload) {
      return toolError(
        "Provide either lead_id (for a lead already in the pipeline) or both " +
          "campaign_id and raw_payload (for a new inbound submission).",
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload =
        typeof raw_payload === "string"
          ? JSON.parse(raw_payload)
          : (raw_payload as Record<string, unknown>);
    } catch {
      return toolError("raw_payload was not valid JSON.");
    }

    const parsed = buildParsed(payload);

    const { data, error } = await db
      .from("leads")
      .insert({
        campaign_id,
        raw_payload: payload,
        parsed,
        stage: "new",
      })
      .select("id")
      .single();

    if (error) return toolError(`Failed to create lead: ${error.message}`);

    return toolResult({
      ok: true,
      lead_id: (data as { id: string }).id,
      campaign_id,
      stage: "new",
      parsed,
      created: true,
      next_step:
        "Read the practice playbook for this campaign's specialty, then call " +
        "score_lead with a score, reasoning, and the signals you identified.",
    });
  },
  {
    name: "ingest_lead",
    description:
      "Parse a raw ad-form submission into structured fields (name, contact " +
      "details, reason for visit, insurance, availability, referral). Pass " +
      "lead_id to parse a lead already in the pipeline, or campaign_id plus " +
      "raw_payload to file a brand new submission. Extraction is deterministic " +
      "and does not assess the lead — it returns the parsed fields so you can " +
      "then read the relevant practice playbook and score it.",
    schema: z.object({
      lead_id: z
        .string()
        .uuid()
        .optional()
        .describe("Parse a lead that already exists in the pipeline."),
      campaign_id: z
        .string()
        .uuid()
        .optional()
        .describe("Required with raw_payload when filing a new submission."),
      raw_payload: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .optional()
        .describe("The raw lead form JSON, for a new submission."),
    }),
  },
);
