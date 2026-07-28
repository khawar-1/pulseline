"use client";

import { formatMoney, formatPct } from "@/lib/pipeline";
import type { CampaignKpis } from "@/lib/supabase/types";

/**
 * The four numbers an account manager reports to a practice.
 *
 * Numbers command the page — Fraunces at large size, the emphasis metric
 * at extra-large. A $10k designer makes KPIs feel like data art, not a table.
 */

export interface KpiSummary {
  label: string;
  spend: number;
  leads_total: number;
  leads_booked: number;
  cost_per_lead: number | null;
  conversion_rate_pct: number | null;
  booked_visit_rate_pct: number | null;
  cost_per_booking: number | null;
}

export function summarise(rows: CampaignKpis[], label: string): KpiSummary {
  const spend     = rows.reduce((t, r) => t + Number(r.spend), 0);
  const leads     = rows.reduce((t, r) => t + r.leads_total, 0);
  const responded = rows.reduce((t, r) => t + r.leads_responded, 0);
  const booked    = rows.reduce((t, r) => t + r.leads_booked, 0);
  const ratio     = (n: number) => leads > 0 ? Math.round(1000 * n / leads) / 10 : null;

  return {
    label,
    spend,
    leads_total: leads,
    leads_booked: booked,
    cost_per_lead:          leads  > 0 ? Math.round(100 * spend / leads)  / 100 : null,
    conversion_rate_pct:    ratio(responded),
    booked_visit_rate_pct:  ratio(booked),
    cost_per_booking:       booked > 0 ? Math.round(100 * spend / booked) / 100 : null,
  };
}

export function KpiRow({ summary }: { summary: KpiSummary }) {
  return (
    <section aria-label="Campaign performance">
      {/* Header row */}
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="label">Performance</span>
        <span className="font-mono text-[0.65rem] text-slate/60">
          {formatMoney(summary.spend)} spend · {summary.leads_total} leads · {summary.leads_booked} booked
        </span>
      </div>

      {/* KPI grid — 4 cards, each a standalone instrument */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Cost / lead"
          value={formatMoney(summary.cost_per_lead)}
          size="md"
        />
        <KpiCard
          label="Conversion"
          value={formatPct(summary.conversion_rate_pct)}
          size="md"
        />
        <KpiCard
          label="Booked rate"
          value={formatPct(summary.booked_visit_rate_pct)}
          size="md"
        />
        <KpiCard
          label="Cost / booking"
          value={formatMoney(summary.cost_per_booking)}
          size="lg"
          emphasis
        />
      </div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  size,
  emphasis = false,
}: {
  label: string;
  value: string;
  size: "md" | "lg";
  emphasis?: boolean;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-line/80 bg-panel px-4 py-4 transition-all duration-200 hover:shadow-[0_4px_20px_rgba(12,17,22,0.09)] hover:-translate-y-px ${
        emphasis
          ? "border-pine/20 shadow-[0_1px_3px_rgba(12,17,22,0.05),0_4px_16px_rgba(18,78,74,0.07)]"
          : "shadow-[0_1px_3px_rgba(12,17,22,0.04),0_4px_12px_rgba(12,17,22,0.05)]"
      }`}
    >
      {/* Pine gradient wash on emphasis card */}
      {emphasis && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06] transition-opacity duration-300 group-hover:opacity-[0.10]"
          style={{ background: "linear-gradient(135deg, #124e4a 0%, transparent 65%)" }}
        />
      )}

      <dt className="label relative mb-2">{label}</dt>
      <dd
        className={`numeric relative font-display leading-none ${
          size === "lg"
            ? emphasis
              ? "text-[2.25rem] text-pine-gradient"
              : "text-[2.25rem] text-ink"
            : "text-[1.75rem] text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
