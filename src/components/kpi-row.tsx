"use client";

import { formatMoney, formatPct } from "@/lib/pipeline";
import type { CampaignKpis } from "@/lib/supabase/types";

/**
 * The four numbers an account manager reports to a practice.
 *
 * All of them are derived on read from the `campaign_kpis` view, so they are
 * recomputed from the pipeline rather than incremented alongside it and cannot
 * drift. Cost per booking is last and largest because it is the only one the
 * practice actually cares about — the other three explain it.
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

/** Roll several campaigns into one book of business. */
export function summarise(rows: CampaignKpis[], label: string): KpiSummary {
  const spend = rows.reduce((total, row) => total + Number(row.spend), 0);
  const leads = rows.reduce((total, row) => total + row.leads_total, 0);
  const responded = rows.reduce((total, row) => total + row.leads_responded, 0);
  const booked = rows.reduce((total, row) => total + row.leads_booked, 0);

  const ratio = (numerator: number) =>
    leads > 0 ? Math.round((1000 * numerator) / leads) / 10 : null;

  return {
    label,
    spend,
    leads_total: leads,
    leads_booked: booked,
    cost_per_lead: leads > 0 ? Math.round((100 * spend) / leads) / 100 : null,
    conversion_rate_pct: ratio(responded),
    booked_visit_rate_pct: ratio(booked),
    cost_per_booking: booked > 0 ? Math.round((100 * spend) / booked) / 100 : null,
  };
}

export function KpiRow({ summary }: { summary: KpiSummary }) {
  const cells = [
    { label: "Cost / lead", value: formatMoney(summary.cost_per_lead) },
    { label: "Conversion", value: formatPct(summary.conversion_rate_pct) },
    { label: "Booked rate", value: formatPct(summary.booked_visit_rate_pct) },
    {
      label: "Cost / booking",
      value: formatMoney(summary.cost_per_booking),
      emphasis: true,
    },
  ];

  return (
    <section aria-label="Campaign performance">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="label">Performance</span>
        <span className="font-mono text-[0.6875rem] text-slate">
          {formatMoney(summary.spend)} spend · {summary.leads_total} leads ·{" "}
          {summary.leads_booked} booked
        </span>
      </div>

      <dl className="grid grid-cols-2 divide-line overflow-hidden rounded-lg border border-line bg-panel sm:grid-cols-4 sm:divide-x">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="border-b border-line px-3 py-2.5 last:border-b-0 sm:border-b-0 [&:nth-child(2)]:border-b sm:[&:nth-child(2)]:border-b-0"
          >
            <dt className="label">{cell.label}</dt>
            <dd
              className={`numeric mt-0.5 font-display leading-none ${
                cell.emphasis ? "text-[1.75rem] text-pine" : "text-[1.5rem] text-ink"
              }`}
            >
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
