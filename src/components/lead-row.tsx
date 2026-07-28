"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

import { useScoreReveal } from "@/hooks/use-score-reveal";
import {
  TONE_CLASS,
  TONE_HEX,
  leadName,
  scoreLabel,
  scoreTone,
  shortId,
  timeAgo,
} from "@/lib/pipeline";
import type { Followup, Lead } from "@/lib/supabase/types";

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
  now,
}: {
  lead: Lead;
  followups: Followup[];
  /** The instant the snapshot was read — see `timeAgo`. */
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const displayScore = useScoreReveal(lead.score);

  const tone = scoreTone(lead.score);
  const parsed = lead.parsed;
  const latest = followups[0];
  const blocked = parsed?.needs_human_review === true;

  return (
    <motion.li
      layout={reduceMotion ? false : "position"}
      // Motion 2 of 3 — a lead travels to its new stage group rather than
      // teleporting, so you can see which lead moved without re-reading the list.
      layoutId={lead.id}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-line last:border-b-0"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-stretch gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-tint/60"
      >
        <span className="flex w-11 shrink-0 flex-col items-center justify-center gap-1">
          {lead.score === null ? (
            <span className={`numeric font-display text-xl leading-none ${TONE_CLASS[tone].text}`}>
              –
            </span>
          ) : (
            <motion.span
              className={`numeric font-display text-xl leading-none ${TONE_CLASS[tone].text}`}
            >
              {displayScore}
            </motion.span>
          )}
          <span className="h-1 w-full overflow-hidden rounded-full bg-line">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: TONE_HEX[tone] }}
              initial={false}
              animate={{ width: `${lead.score ?? 0}%` }}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut" }}
            />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[0.875rem] font-medium text-ink">
              {leadName(lead)}
            </span>
            {blocked && (
              <span className="shrink-0 rounded-sm bg-crimson-tint px-1.5 py-px font-mono text-[0.625rem] font-medium text-crimson">
                human review
              </span>
            )}
            {latest?.compliance_verdict && (
              <span className="shrink-0 rounded-sm bg-pine-tint px-1.5 py-px font-mono text-[0.625rem] font-medium text-pine">
                {latest.compliance_verdict}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-slate">
            <span className="font-mono text-[0.6875rem] text-slate/70">
              {shortId(lead.id)}
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">
              {parsed?.reason ?? parsed?.intent ?? "not parsed yet"}
            </span>
          </span>
        </span>

        <span className="shrink-0 self-center font-mono text-[0.6875rem] text-slate/80">
          {timeAgo(lead.updated_at, now)}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            className="overflow-hidden bg-paper"
          >
            <div className="space-y-3 border-t border-line px-3 py-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Field label="Contact" value={parsed?.email ?? parsed?.phone ?? "—"} mono />
                <Field label="Insurance" value={parsed?.insurance ?? "—"} />
                <Field label="Prefers" value={parsed?.preferred_time ?? "—"} />
                <Field label="Deadline" value={parsed?.deadline ?? "—"} />
              </dl>

              {lead.score !== null && (
                <div>
                  <p className="label">
                    {scoreLabel(lead.score)} — why
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink/85">
                    {lead.score_reasoning ?? "No reasoning recorded."}
                  </p>
                  {parsed?.urgency_signals && parsed.urgency_signals.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1">
                      {parsed.urgency_signals.map((signal) => (
                        <li
                          key={signal}
                          className="rounded-sm bg-slate-tint px-1.5 py-0.5 font-mono text-[0.6875rem] text-slate"
                        >
                          {signal}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {latest && (
                <div className="rounded-md border border-pine/25 bg-pine-tint/50 p-2.5">
                  <p className="label text-pine">
                    {latest.channel} sent · compliance {latest.compliance_verdict ?? "—"}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-ink">
                    {latest.content}
                  </p>
                  {latest.compliance_notes && (
                    <p className="mt-2 border-t border-pine/20 pt-2 text-[0.75rem] leading-relaxed text-pine/90">
                      {latest.compliance_notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
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
      <dt className="label">{label}</dt>
      <dd
        className={`truncate text-[0.8125rem] text-ink/85 ${mono ? "font-mono text-[0.75rem]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
