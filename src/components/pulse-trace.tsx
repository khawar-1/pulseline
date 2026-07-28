"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId, useMemo, useState } from "react";

import { STAGE_META, TONE_HEX, leadName } from "@/lib/pipeline";
import type { Lead, StageEvent } from "@/lib/supabase/types";

/**
 * The Pulse Trace — the signature element.
 *
 * It is a rendering of the `stage_events` table, not decoration: one QRS
 * complex per pipeline movement, **amplitude set by the lead's score**, colour
 * set by the stage it moved into, and a downward spike when a lead is lost.
 * Between events the line is flat, so a campaign nobody is working literally
 * flatlines and a campaign being worked has rhythm. That is the whole argument
 * for the name.
 *
 * Drawn as one SVG per event rather than a single path because each complex
 * carries its own colour, and stroke colour cannot vary along a path.
 *
 * The background is the ink color (#0C1116) — the clinical monitor aesthetic
 * makes the colored traces pop and communicates that this is real instrument
 * data, not a sparkline decoration.
 */

const VIEW_W = 1200;
const VIEW_H = 150;
const BASELINE = 104;

/** Enough empty slots that a quiet campaign reads as quiet, not as zoomed in. */
const MIN_SLOTS = 16;
const MAX_EVENTS = 40;

const MIN_AMPLITUDE = 20;
const MAX_AMPLITUDE = 82;

interface Beat {
  event: StageEvent;
  lead: Lead | undefined;
  amplitude: number;
  /** -1 for a lost lead: the pipeline moving backwards points down. */
  direction: 1 | -1;
  color: string;
}

function complexPath(x0: number, slot: number, beat: Beat): string {
  const { amplitude: a, direction: dir } = beat;
  const y = (value: number) => BASELINE - dir * value;
  const x = (fraction: number) => x0 + slot * fraction;

  return [
    `M ${x(0)} ${BASELINE}`,
    `L ${x(0.1)} ${y(0.1 * a)}`,   // P
    `L ${x(0.18)} ${BASELINE}`,
    `L ${x(0.26)} ${y(-0.14 * a)}`, // Q
    `L ${x(0.34)} ${y(a)}`,          // R — the score
    `L ${x(0.42)} ${y(-0.22 * a)}`, // S
    `L ${x(0.5)} ${BASELINE}`,
    `L ${x(0.66)} ${y(0.16 * a)}`,  // T
    `L ${x(0.78)} ${BASELINE}`,
    `L ${x(1)} ${BASELINE}`,
  ].join(" ");
}

export function PulseTrace({
  events,
  leads,
}: {
  events: StageEvent[];
  leads: Lead[];
}) {
  const clipId = useId();
  const glowId = useId();
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);

  const { beats, slot, offset } = useMemo(() => {
    const byId = new Map(leads.map((lead) => [lead.id, lead]));
    const recent = events.slice(-MAX_EVENTS);
    const slots = Math.max(recent.length, MIN_SLOTS);
    const slotWidth = VIEW_W / slots;

    const built: Beat[] = recent.map((event) => {
      const lead = byId.get(event.lead_id);
      const score = lead?.score;
      return {
        event,
        lead,
        amplitude:
          score === null || score === undefined
            ? MIN_AMPLITUDE + 6
            : MIN_AMPLITUDE + (score / 100) * (MAX_AMPLITUDE - MIN_AMPLITUDE),
        direction: event.to_stage === "lost" ? -1 : 1,
        color: TONE_HEX[STAGE_META[event.to_stage].tone],
      };
    });

    // Right-align: the newest beat always sits at the right edge.
    return {
      beats: built,
      slot: slotWidth,
      offset: (slots - built.length) * slotWidth,
    };
  }, [events, leads]);

  const active = hovered === null ? null : beats[hovered];

  return (
    <figure className="relative">
      <figcaption className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="label">Pulse — last {beats.length} pipeline events</span>
        <span className="font-mono text-[0.6rem] text-slate/50 normal-case tracking-normal">
          height = lead score
        </span>
      </figcaption>

      {/* Clinical monitor — dark background makes traces pop */}
      <div
        className="relative overflow-hidden rounded-xl"
        style={{ background: "#0C1116", border: "1px solid #1E2830" }}
        onMouseLeave={() => setHovered(null)}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="block h-[132px] w-full sm:h-[150px]"
          role="img"
          aria-label={
            beats.length
              ? `Pipeline activity: ${beats.length} recent stage changes, most recent ${
                  beats[beats.length - 1]?.event.to_stage
                }.`
              : "No pipeline activity yet."
          }
        >
          <defs>
            <clipPath id={clipId}>
              {/* Motion 1 of 3 — the trace draws itself left to right on load.
                  A clip wipe rather than per-path dash offsets, so every
                  differently-shaped complex reveals on the same timeline.

                  `initial` is unconditional even though the duration is not:
                  `useReducedMotion` reads a media query, which only exists in
                  the browser, so branching on it here would make the server
                  render a full-width clip and the client a zero-width one and
                  fail hydration. Reduced motion is honoured by collapsing the
                  duration instead — same end state, no in-between frames. */}
              <motion.rect
                x={0}
                y={0}
                height={VIEW_H}
                initial={{ width: 0 }}
                animate={{ width: VIEW_W }}
                transition={{ duration: reduceMotion ? 0 : 1.1, ease: "easeOut" }}
              />
            </clipPath>

            {/* Glow filter for hovered beat */}
            <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Dark graph-paper ruling — lighter than background, dimmer than traces */}
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1={0}
              x2={VIEW_W}
              y1={VIEW_H * fraction}
              y2={VIEW_H * fraction}
              stroke="#1E2830"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <g clipPath={`url(#${clipId})`}>
            {/* Baseline — faint green, like a real ECG baseline */}
            <line
              x1={0}
              x2={VIEW_W}
              y1={BASELINE}
              y2={BASELINE}
              stroke="#1a3a38"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />

            {/* ECG beats */}
            {beats.map((beat, index) => {
              const isHovered = hovered === index;
              return (
                <path
                  key={beat.event.id}
                  d={complexPath(offset + index * slot, slot, beat)}
                  fill="none"
                  stroke={beat.color}
                  strokeWidth={isHovered ? 2.5 : 1.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={hovered === null || isHovered ? 1 : 0.25}
                  filter={isHovered ? `url(#${glowId})` : undefined}
                  style={{
                    transition: "opacity 0.15s ease, stroke-width 0.15s ease",
                  }}
                />
              );
            })}
          </g>

          {/* Hit targets — wider than visible complex so hover is forgiving */}
          {beats.map((beat, index) => (
            <rect
              key={`hit-${beat.event.id}`}
              x={offset + index * slot}
              y={0}
              width={slot}
              height={VIEW_H}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
            />
          ))}
        </svg>

        {/* Flatline message */}
        {beats.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs text-slate/40 animate-breath">
            flatline — no pipeline movement yet
          </p>
        )}

        {/* Hover tooltip — dark glass morphism */}
        {active && (
          <div
            className="pointer-events-none absolute top-2.5 z-10 min-w-44 max-w-56 -translate-x-1/2 rounded-xl px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            style={{
              left: `${Math.min(
                90,
                Math.max(10, ((offset + (hovered! + 0.34) * slot) / VIEW_W) * 100),
              )}%`,
              background: "rgba(20, 27, 34, 0.92)",
              border: `1px solid ${active.color}40`,
              backdropFilter: "blur(12px)",
            }}
          >
            {/* Colored top accent line */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl"
              style={{ background: active.color }}
            />
            <p className="truncate text-[0.8rem] font-semibold text-white">
              {active.lead ? leadName(active.lead) : "Removed lead"}
            </p>
            <p className="mt-1 font-mono text-[0.68rem] text-white/50">
              {active.event.from_stage ?? "—"} → {active.event.to_stage}
            </p>
            <p
              className="mt-1 font-mono text-[0.68rem] font-medium"
              style={{ color: active.color }}
            >
              score {active.lead?.score ?? "—"}
            </p>
          </div>
        )}

        {/* Subtle scanline overlay for authentic monitor feel */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: "repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(255,255,255,0.8) 3px, rgba(255,255,255,0.8) 4px)",
          }}
        />
      </div>
    </figure>
  );
}
