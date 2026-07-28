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
    `L ${x(0.1)} ${y(0.1 * a)}`, // P
    `L ${x(0.18)} ${BASELINE}`,
    `L ${x(0.26)} ${y(-0.14 * a)}`, // Q
    `L ${x(0.34)} ${y(a)}`, // R — the score
    `L ${x(0.42)} ${y(-0.22 * a)}`, // S
    `L ${x(0.5)} ${BASELINE}`,
    `L ${x(0.66)} ${y(0.16 * a)}`, // T
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

    // Right-align: the newest beat always sits at the right edge, like a strip
    // chart feeding out of the machine.
    return {
      beats: built,
      slot: slotWidth,
      offset: (slots - built.length) * slotWidth,
    };
  }, [events, leads]);

  const active = hovered === null ? null : beats[hovered];

  return (
    <figure className="relative">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="label">Pulse — last {beats.length} pipeline events</span>
        <span className="label normal-case tracking-normal text-slate/80">
          height = lead score
        </span>
      </figcaption>

      <div
        className="relative overflow-hidden rounded-lg border border-line bg-panel"
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
                transition={{ duration: reduceMotion ? 0 : 0.9, ease: "easeOut" }}
              />
            </clipPath>
          </defs>

          {/* Graph-paper ruling behind the trace. */}
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1={0}
              x2={VIEW_W}
              y1={VIEW_H * fraction}
              y2={VIEW_H * fraction}
              stroke="#E3E7EA"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <g clipPath={`url(#${clipId})`}>
            <line
              x1={0}
              x2={VIEW_W}
              y1={BASELINE}
              y2={BASELINE}
              stroke="#CFD6DC"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />

            {beats.map((beat, index) => (
              <path
                key={beat.event.id}
                d={complexPath(offset + index * slot, slot, beat)}
                fill="none"
                stroke={beat.color}
                strokeWidth={hovered === index ? 3 : 1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={hovered === null || hovered === index ? 1 : 0.35}
              />
            ))}
          </g>

          {/* Hit targets. Wider than the visible complex so hover is forgiving. */}
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

        {beats.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs text-slate">
            flatline — no pipeline movement yet
          </p>
        )}

        {active && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-40 max-w-56 -translate-x-1/2 rounded-md border border-line bg-panel px-2.5 py-2 shadow-[0_6px_20px_-8px_rgba(12,17,22,0.35)]"
            style={{
              left: `${Math.min(
                92,
                Math.max(8, ((offset + (hovered! + 0.34) * slot) / VIEW_W) * 100),
              )}%`,
            }}
          >
            <p className="truncate text-[0.8rem] font-medium text-ink">
              {active.lead ? leadName(active.lead) : "Removed lead"}
            </p>
            <p className="mt-0.5 font-mono text-[0.7rem] text-slate">
              {active.event.from_stage ?? "—"} → {active.event.to_stage}
            </p>
            <p className="mt-1 font-mono text-[0.7rem]" style={{ color: active.color }}>
              score {active.lead?.score ?? "—"}
            </p>
          </div>
        )}
      </div>
    </figure>
  );
}
