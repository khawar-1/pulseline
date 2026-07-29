"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

import { useScoreReveal } from "@/hooks/use-score-reveal";
import {
  STAGE_META,
  STAGE_ORDER,
  TONE_CLASS,
  TONE_HEX,
  formatDate,
  leadName,
  scoreLabel,
  scoreTone,
  timeAgo,
} from "@/lib/pipeline";
import type { Followup, Lead, Stage, StageEvent } from "@/lib/supabase/types";

/**
 * One lead in the rail.
 *
 * The score gets a gutter of its own — a number plus a bar whose height is
 * that number — because ordering the day's work is the only reason the score
 * exists. Expanding a row shows what the agent actually persisted: the signals
 * it scored on, and the message it sent along with the compliance verdict that
 * let it through. A verdict you cannot inspect is not a control.
 */
export function LeadRow({
  lead,
  followups,
  bookings = [],
  now,
}: {
  lead: Lead;
  followups: Followup[];
  /**
   * Every 'booked' transition this lead has ever reached, oldest first. A
   * returning patient who books again reuses this same lead card rather than
   * getting a second one, so a second booking shows up here as a second date
   * instead of a second row in the pipeline.
   */
  bookings?: StageEvent[];
  /** The instant the snapshot was read — see `timeAgo`. */
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const displayScore = useScoreReveal(lead.score);
  const [stageDraft, setStageDraft] = useState<Stage>(lead.stage);
  const [savingStage, setSavingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  // Keep the draft in step when Realtime brings in a stage change from
  // elsewhere (the agent, or this same edit landing) -- otherwise the select
  // would keep showing a stale value after a successful save. Adjusted during
  // render rather than in an effect (React's recommended pattern for this),
  // so there's no extra render pass and no lint violation on setState-in-effect.
  const [trackedStage, setTrackedStage] = useState(lead.stage);
  if (lead.stage !== trackedStage) {
    setTrackedStage(lead.stage);
    setStageDraft(lead.stage);
  }

  const saveStage = async () => {
    if (stageDraft === lead.stage) return;
    setSavingStage(true);
    setStageError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_stage: stageDraft }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStageError(json.error ?? "Failed to update stage.");
        setStageDraft(lead.stage);
      }
      // On success, Realtime picks up the leads/stage_events change and
      // refetches the snapshot -- no local state patch needed here.
    } catch {
      setStageError("Network error — could not reach the server.");
      setStageDraft(lead.stage);
    } finally {
      setSavingStage(false);
    }
  };

  const tone = scoreTone(lead.score);
  const toneHex = TONE_HEX[tone];
  const parsed = lead.parsed;
  const latest = followups[0];
  const blocked = parsed?.needs_human_review === true;

  // Left-border accent class keyed by score tone
  const accentClass =
    tone === "pine"    ? "lead-accent-pine"
    : tone === "amber"  ? "lead-accent-amber"
    : tone === "crimson" ? "lead-accent-crimson"
    : "lead-accent-slate";

  return (
    <motion.li
      layout={reduceMotion ? false : "position"}
      layoutId={lead.id}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={`border-b border-line/60 last:border-b-0 ${accentClass}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group relative flex w-full items-stretch gap-3.5 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-slate-tint/40"
        style={{
          // Subtle tone-matched left glow on hover — uses CSS approach for no-JS fallback
          backgroundImage: open
            ? `linear-gradient(to right, ${toneHex}0A 0%, transparent 40%)`
            : undefined,
        }}
      >
        {/* Hover left-glow overlay */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-r-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: toneHex }}
        />

        {/* Score gutter */}
        <span className="flex w-10 shrink-0 flex-col items-center justify-center gap-1.5">
          {lead.score === null ? (
            <span className={`numeric font-display text-xl leading-none ${TONE_CLASS[tone].text} opacity-30`}>
              —
            </span>
          ) : (
            <motion.span
              className={`numeric font-display text-xl leading-none ${TONE_CLASS[tone].text}`}
              style={{ display: "block" }}
            >
              {displayScore}
            </motion.span>
          )}
          {/* Score bar with tone-matched glow */}
          <span className="h-1 w-full overflow-hidden rounded-full bg-line">
            <motion.span
              className="block h-full rounded-full"
              style={{
                background: toneHex,
                boxShadow: lead.score && lead.score > 0 ? `0 0 4px ${toneHex}80` : undefined,
              }}
              initial={false}
              animate={{ width: `${lead.score ?? 0}%` }}
              transition={{ duration: reduceMotion ? 0 : 0.55, ease: "easeOut" }}
            />
          </span>
        </span>

        {/* Lead info */}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-[0.9rem] font-bold text-ink tracking-tight">
              {leadName(lead)}
            </span>
            {blocked && (
              <span className="shrink-0 rounded-full bg-crimson-tint px-2 py-px font-mono text-[0.6rem] font-semibold text-crimson ring-1 ring-crimson/20 animate-pulse-dot">
                human review
              </span>
            )}
            {latest?.compliance_verdict && (
              <span className="shrink-0 rounded-full bg-pine-tint px-2 py-px font-mono text-[0.6rem] font-semibold text-pine ring-1 ring-pine/20">
                {latest.compliance_verdict}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-slate/60">
            <span className="truncate">
              {parsed?.reason ?? parsed?.intent ?? "not parsed yet"}
            </span>
          </span>
        </span>

        {/* Timestamp */}
        <span className="shrink-0 self-center font-mono text-[0.6875rem] text-slate/50">
          {timeAgo(lead.updated_at, now)}
        </span>
      </button>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3.5 border-t border-line/60 bg-paper px-4 py-4">
              {/* Fields grid */}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                <Field label="Contact"   value={parsed?.email ?? parsed?.phone ?? "—"} mono />
                <Field label="Insurance" value={parsed?.insurance ?? "—"} />
                <Field label="Prefers"   value={parsed?.preferred_time ?? "—"} />
                <Field label="Deadline"  value={parsed?.deadline ?? "—"} />
              </dl>

              {/* Score reasoning */}
              {lead.score !== null && (
                <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
                  <p className="label mb-1.5">{scoreLabel(lead.score)} — why</p>
                  <p className="text-[0.8125rem] leading-relaxed text-ink/80">
                    {lead.score_reasoning ?? "No reasoning recorded."}
                  </p>
                  {parsed?.urgency_signals && parsed.urgency_signals.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {parsed.urgency_signals.map((signal) => (
                        <li
                          key={signal}
                          className="rounded-full bg-slate-tint px-2.5 py-0.5 font-mono text-[0.65rem] text-slate"
                        >
                          {signal}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Repeat bookings on this same card -- a returning patient who
                  books again shows up as a second date here, not a second
                  lead row. A single booking is already conveyed by the stage
                  badge, so this only renders once there is more than one. */}
              {bookings.length > 1 && (
                <div className="rounded-lg border border-pine/25 bg-pine-tint/30 px-3 py-2">
                  <p className="label mb-1 text-pine">Booked {bookings.length}×</p>
                  <p className="font-mono text-[0.7rem] text-pine/80">
                    {bookings.map((b) => formatDate(b.created_at)).join(" · ")}
                  </p>
                </div>
              )}

              {/* Latest followup message -- can be an inbound patient reply
                  now that followups holds both directions. */}
              {latest && (
                <div
                  className={
                    latest.direction === "inbound"
                      ? "rounded-xl border border-amber/25 bg-amber-tint/40 p-3"
                      : "rounded-xl border border-pine/25 bg-pine-tint/40 p-3"
                  }
                >
                  <p className={`label mb-2 ${latest.direction === "inbound" ? "text-amber" : "text-pine"}`}>
                    {latest.direction === "inbound"
                      ? `Patient replied via ${latest.channel}`
                      : `${outboundVerb(latest)} · compliance ${latest.compliance_verdict ?? "—"}`}
                  </p>
                  <p
                    className={
                      latest.direction === "inbound"
                        ? "whitespace-pre-wrap rounded-lg border border-amber/15 bg-panel/80 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink"
                        : "whitespace-pre-wrap rounded-lg border border-pine/15 bg-panel/80 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink"
                    }
                  >
                    {latest.content}
                  </p>
                  {latest.compliance_notes && (
                    <p className="mt-2.5 border-t border-pine/15 pt-2 text-[0.75rem] leading-relaxed text-pine/80">
                      {latest.compliance_notes}
                    </p>
                  )}
                </div>
              )}

              {/* Manual stage override -- for a booking (or a loss, or a
                  reply) that happened somewhere Pulseline can't see, like a
                  phone call. Not restricted to forward moves; a correction
                  is exactly the case where you need to go backward. */}
              <div
                className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2"
                onClick={(e) => e.stopPropagation()}
              >
                <label className="label shrink-0">Stage</label>
                <select
                  value={stageDraft}
                  onChange={(e) => setStageDraft(e.target.value as Stage)}
                  disabled={savingStage}
                  className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-[0.8125rem] text-ink outline-none focus:border-pine/50 disabled:opacity-50"
                >
                  {STAGE_ORDER.map((stage) => (
                    <option key={stage} value={stage}>{STAGE_META[stage].label}</option>
                  ))}
                </select>
                {stageDraft !== lead.stage && (
                  <button
                    type="button"
                    onClick={saveStage}
                    disabled={savingStage}
                    className="shrink-0 rounded-md bg-pine-gradient px-2.5 py-1 text-[0.75rem] font-semibold text-white disabled:opacity-50"
                  >
                    {savingStage ? "Saving…" : "Save"}
                  </button>
                )}
              </div>
              {stageError && (
                <p className="rounded-lg border border-crimson/25 bg-crimson-tint/40 px-3 py-2 text-[0.75rem] text-crimson">
                  {stageError}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/**
 * What to call an outbound message, honestly reflecting whether it actually
 * left via Twilio or only cleared compliance and was persisted. "sent" is
 * only ever said when dispatch_status genuinely says so — sms/email have
 * always been persist-only (no provider wired up for either), and whatsapp
 * without Twilio configured is compliance-cleared and ready, not delivered.
 */
function outboundVerb(followup: Followup): string {
  if (followup.channel !== "whatsapp") return `${followup.channel} drafted`;
  if (followup.dispatch_status === "sent") return "whatsapp sent";
  if (followup.dispatch_status === "failed") return "whatsapp drafted — send failed";
  return "whatsapp drafted";
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="label mb-0.5">{label}</dt>
      <dd
        className={`truncate text-[0.8125rem] text-ink/80 ${mono ? "font-mono text-[0.75rem]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
