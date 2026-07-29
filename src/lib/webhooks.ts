import { supabaseAdmin } from "@/lib/supabase/server";
import type { WebhookEvent, WebhookSource } from "@/lib/supabase/types";

/**
 * Idempotency + audit for the two webhook entry points.
 *
 * The unique index on (source, dedup_key) is the entire dedup mechanism: try
 * to insert, and on a unique-violation look up the row that already exists
 * and treat this delivery as a repeat rather than re-running the agent.
 * Google Apps Script and Twilio both retry on anything but a clean 2xx, so
 * this has to be cheap and race-safe rather than a check-then-insert.
 */

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function recordWebhookEvent(input: {
  source: WebhookSource;
  dedupKey: string;
  payload: Record<string, unknown>;
}): Promise<{ event: WebhookEvent; isDuplicate: boolean }> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("webhook_events")
    .insert({ source: input.source, dedup_key: input.dedupKey, payload: input.payload })
    .select("*")
    .single();

  if (!error) {
    return { event: data as WebhookEvent, isDuplicate: false };
  }

  if (error.code === POSTGRES_UNIQUE_VIOLATION) {
    const { data: existing, error: lookupError } = await db
      .from("webhook_events")
      .select("*")
      .eq("source", input.source)
      .eq("dedup_key", input.dedupKey)
      .single();

    if (lookupError || !existing) {
      throw new Error(
        `Duplicate webhook event (${input.source}/${input.dedupKey}) but could not read it back: ` +
          `${lookupError?.message ?? "not found"}`,
      );
    }

    return { event: existing as WebhookEvent, isDuplicate: true };
  }

  throw new Error(`Failed to record webhook event: ${error.message}`);
}

export async function markWebhookEventDone(
  id: string,
  input: { leadId: string | null; ok: boolean; error?: string | null },
): Promise<void> {
  await supabaseAdmin()
    .from("webhook_events")
    .update({
      lead_id: input.leadId,
      status: input.ok ? "processed" : "failed",
      error: input.error ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/** Marks an event as deliberately not run (e.g. no matching lead for a reply). */
export async function markWebhookEventSkipped(id: string, reason: string): Promise<void> {
  await supabaseAdmin()
    .from("webhook_events")
    .update({ status: "skipped", error: reason, processed_at: new Date().toISOString() })
    .eq("id", id);
}
