"use client";

import { LayoutGroup } from "framer-motion";
import { useMemo, useState } from "react";

import { LeadRow } from "@/components/lead-row";
import { STAGE_META, STAGE_ORDER, TONE_HEX } from "@/lib/pipeline";
import type { Followup, Lead, Stage, StageEvent } from "@/lib/supabase/types";

/**
 * The pipeline, as a vertical rail grouped by stage.
 *
 * Deliberately not a six-column kanban. The pipeline pane is a little over half
 * the viewport on desktop and the whole of it on mobile; six columns at that
 * width gives every lead about 90px and makes the score — the one thing you
 * read the list for — unreadable. A rail keeps rows full width, keeps the
 * stages in work order top to bottom, and degrades to mobile without a redesign.
 *
 * Scalability: each stage group shows at most PAGE_SIZE leads by default, with
 * a "Show N more" button to expand. This is the Linear / HubSpot pattern —
 * the view stays fast and scannable whether a stage has 5 leads or 500.
 * When the user has applied a search or score filter, the limit is lifted so
 * they see every match without extra clicks.
 */

/** Max leads visible per stage before the "show more" button appears. */
const PAGE_SIZE = 5;

export function StageRail({
  leads,
  followups,
  events,
  now,
  isFiltered = false,
}: {
  leads: Lead[];
  followups: Followup[];
  /** Full stage-change audit log — used here only to surface repeat bookings. */
  events: StageEvent[];
  /** The instant the snapshot was read — see `timeAgo`. */
  now: number;
  /** When true (search/filter active), lifts the per-stage page limit. */
  isFiltered?: boolean;
}) {
  const followupsByLead = useMemo(() => {
    const map = new Map<string, Followup[]>();
    for (const followup of followups) {
      const list = map.get(followup.lead_id);
      if (list) list.push(followup);
      else map.set(followup.lead_id, [followup]);
    }
    return map;
  }, [followups]);

  // A lead that returns and books again gets a second real 'booked'
  // transition on the same card (see the forms webhook's stage-reset logic)
  // rather than a second lead row. This is what surfaces "booked twice" —
  // every booking date the lead has ever reached, oldest first.
  const bookingsByLead = useMemo(() => {
    const map = new Map<string, StageEvent[]>();
    for (const event of events) {
      if (event.to_stage !== "booked") continue;
      const list = map.get(event.lead_id);
      if (list) list.push(event);
      else map.set(event.lead_id, [event]);
    }
    return map;
  }, [events]);

  const groups = useMemo(() => {
    const byStage = new Map<Stage, Lead[]>();
    for (const lead of leads) {
      const list = byStage.get(lead.stage);
      if (list) list.push(lead);
      else byStage.set(lead.stage, [lead]);
    }
    // Highest score first inside a stage: the rail is a work queue.
    for (const list of byStage.values()) {
      list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    }
    return STAGE_ORDER.map((stage) => ({
      stage,
      leads: byStage.get(stage) ?? [],
    })).filter((group) => group.leads.length > 0);
  }, [leads]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-strong/60 bg-panel/40 px-6 py-14 text-center">
        {isFiltered ? (
          <>
            <svg
              width="28" height="28" viewBox="0 0 24 24" fill="none"
              className="text-slate/25" aria-hidden
            >
              <circle cx="10.5" cy="10.5" r="7" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M8 10.5h5M10.5 8v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <div>
              <p className="text-[0.875rem] font-semibold text-ink/60">No leads match</p>
              <p className="mt-0.5 font-mono text-[0.7rem] text-slate/40">
                Try broadening your filters
              </p>
            </div>
          </>
        ) : (
          <>
            <svg
              width="28" height="28" viewBox="0 0 24 24" fill="none"
              className="text-slate/25" aria-hidden
            >
              <rect x="3" y="6" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M7 10h10M7 14h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            <div>
              <p className="text-[0.875rem] font-semibold text-ink/60">No leads yet</p>
              <p className="mt-0.5 font-mono text-[0.7rem] text-slate/40">
                Run the agent to process your first lead
              </p>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <LayoutGroup>
      <div className="space-y-5">
        {groups.map(({ stage, leads: stageLeads }) => (
          <StageGroup
            key={stage}
            stage={stage}
            leads={stageLeads}
            followupsByLead={followupsByLead}
            bookingsByLead={bookingsByLead}
            now={now}
            isFiltered={isFiltered}
          />
        ))}
      </div>
    </LayoutGroup>
  );
}

/**
 * One stage's section — has its own "expanded" state so each stage
 * expands independently. The "show more" count tells the user exactly
 * how many they're not seeing without making them click blind.
 */
function StageGroup({
  stage,
  leads,
  followupsByLead,
  bookingsByLead,
  now,
  isFiltered,
}: {
  stage: Stage;
  leads: Lead[];
  followupsByLead: Map<string, Followup[]>;
  bookingsByLead: Map<string, StageEvent[]>;
  now: number;
  isFiltered: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = STAGE_META[stage];
  const toneHex = TONE_HEX[meta.tone];

  // Lift the limit when: user has clicked expand OR a filter is active.
  const showAll = expanded || isFiltered;
  const visible = showAll ? leads : leads.slice(0, PAGE_SIZE);
  const hiddenCount = leads.length - visible.length;

  return (
    <section aria-label={meta.label}>
      {/* Pill-shaped stage header */}
      <header className="mb-2 flex items-center gap-2.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em]"
          style={{
            background: `${toneHex}18`,
            color: toneHex,
            border: `1px solid ${toneHex}30`,
          }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: toneHex }}
            aria-hidden
          />
          {meta.label}
        </span>
        <span
          className="numeric font-mono text-[0.6875rem]"
          style={{ color: `${toneHex}99` }}
        >
          {leads.length}
        </span>
        <span className="ml-auto hidden truncate font-mono text-[0.6rem] text-slate/50 sm:block">
          {meta.hint}
        </span>
      </header>

      {/* Lead tray */}
      <ul className="overflow-hidden rounded-xl border border-line bg-panel shadow-[inset_0_1px_4px_rgba(12,17,22,0.04),0_1px_2px_rgba(12,17,22,0.04)]">
        {visible.map((lead) => (
          <LeadRow
            key={lead.id}
            lead={lead}
            followups={followupsByLead.get(lead.id) ?? []}
            bookings={bookingsByLead.get(lead.id) ?? []}
            now={now}
          />
        ))}
      </ul>

      {/* "Show more / Show less" — the scalability control */}
      {!isFiltered && leads.length > PAGE_SIZE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="group mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 font-mono text-[0.7rem] text-slate/60 transition-all duration-150 hover:border-pine/30 hover:bg-pine-tint/30 hover:text-pine"
        >
          <span
            aria-hidden
            className="transition-transform duration-200"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            ▾
          </span>
          {expanded
            ? `Show fewer`
            : `Show ${hiddenCount} more in ${meta.label.toLowerCase()}`}
        </button>
      )}
    </section>
  );
}
