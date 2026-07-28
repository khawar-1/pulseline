"use client";

import { LayoutGroup } from "framer-motion";
import { useMemo } from "react";

import { LeadRow } from "@/components/lead-row";
import { STAGE_META, STAGE_ORDER, TONE_CLASS } from "@/lib/pipeline";
import type { Followup, Lead, Stage } from "@/lib/supabase/types";

/**
 * The pipeline, as a vertical rail grouped by stage.
 *
 * Deliberately not a six-column kanban. The pipeline pane is a little over half
 * the viewport on desktop and the whole of it on mobile; six columns at that
 * width gives every lead about 90px and makes the score — the one thing you
 * read the list for — unreadable. A rail keeps rows full width, keeps the
 * stages in work order top to bottom, and degrades to mobile without a redesign.
 */
export function StageRail({
  leads,
  followups,
  now,
}: {
  leads: Lead[];
  followups: Followup[];
  /** The instant the snapshot was read — see `timeAgo`. */
  now: number;
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
      <p className="rounded-lg border border-dashed border-line-strong px-4 py-10 text-center text-sm text-slate">
        No leads in this campaign.
      </p>
    );
  }

  return (
    <LayoutGroup>
      <div className="space-y-4">
        {groups.map(({ stage, leads: stageLeads }) => {
          const meta = STAGE_META[stage];
          return (
            <section key={stage} aria-label={meta.label}>
              <header className="mb-1.5 flex items-baseline gap-2">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${TONE_CLASS[meta.tone].dot}`}
                  aria-hidden
                />
                <h3 className="label text-ink">{meta.label}</h3>
                <span className="numeric font-mono text-[0.6875rem] text-slate">
                  {stageLeads.length}
                </span>
                <span className="ml-auto hidden truncate text-[0.6875rem] text-slate/80 sm:block">
                  {meta.hint}
                </span>
              </header>

              <ul className="overflow-hidden rounded-lg border border-line bg-panel">
                {stageLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    followups={followupsByLead.get(lead.id) ?? []}
                    now={now}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
