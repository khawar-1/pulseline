"use client";

import { useMemo } from "react";

import { KpiRow, summarise } from "@/components/kpi-row";
import { PulseTrace } from "@/components/pulse-trace";
import { StageRail } from "@/components/stage-rail";
import type { LiveStatus } from "@/hooks/use-pipeline";
import { AD_SOURCE_LABEL, PRACTICE_LABEL } from "@/lib/pipeline";
import type { Snapshot } from "@/lib/snapshot";

export const ALL_CAMPAIGNS = "all";

/**
 * The right pane: what the agent has actually done to the database.
 *
 * Everything here is read straight from Postgres over Realtime. Nothing is
 * mirrored from the chat stream, so if the transcript and this pane ever
 * disagree, this pane is right — which is the property you want when the point
 * of the product is that the agent's claims are checkable.
 */
export function PanelPane({
  snapshot,
  status,
  campaignId,
  onSelectCampaign,
}: {
  snapshot: Snapshot;
  status: LiveStatus;
  campaignId: string;
  onSelectCampaign: (id: string) => void;
}) {
  const scope = useMemo(() => {
    const all = campaignId === ALL_CAMPAIGNS;
    const campaign = snapshot.campaigns.find((row) => row.id === campaignId);

    const kpis = all
      ? snapshot.kpis
      : snapshot.kpis.filter((row) => row.campaign_id === campaignId);

    return {
      campaign,
      leads: all
        ? snapshot.leads
        : snapshot.leads.filter((lead) => lead.campaign_id === campaignId),
      events: all
        ? snapshot.events
        : snapshot.events.filter((event) => event.campaign_id === campaignId),
      summary: summarise(kpis, campaign?.practice_name ?? "All campaigns"),
    };
  }, [campaignId, snapshot]);

  const leadIds = useMemo(() => new Set(scope.leads.map((lead) => lead.id)), [scope.leads]);
  const followups = useMemo(
    () => snapshot.followups.filter((row) => leadIds.has(row.lead_id)),
    [leadIds, snapshot.followups],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <header className="shrink-0 border-b border-line bg-panel/70 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="label">Panel</h2>
          <LiveBadge status={status} />
        </div>

        <div
          className="scrollbar-slim -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
          role="tablist"
          aria-label="Campaign"
        >
          <CampaignChip
            active={campaignId === ALL_CAMPAIGNS}
            onClick={() => onSelectCampaign(ALL_CAMPAIGNS)}
            title="All campaigns"
            subtitle={`${snapshot.campaigns.length} practices`}
          />
          {snapshot.campaigns.map((campaign) => (
            <CampaignChip
              key={campaign.id}
              active={campaignId === campaign.id}
              onClick={() => onSelectCampaign(campaign.id)}
              title={campaign.practice_name}
              subtitle={`${PRACTICE_LABEL[campaign.practice_type] ?? campaign.practice_type} · ${
                AD_SOURCE_LABEL[campaign.ad_source] ?? campaign.ad_source
              }`}
            />
          ))}
        </div>
      </header>

      <div className="scrollbar-slim min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        <PulseTrace events={scope.events} leads={scope.leads} />
        <KpiRow summary={scope.summary} />
        <section aria-label="Pipeline">
          <h2 className="label mb-2">Pipeline · {scope.leads.length} leads</h2>
          <StageRail leads={scope.leads} followups={followups} now={snapshot.fetchedAt} />
        </section>
      </div>
    </div>
  );
}

function CampaignChip({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
        active
          ? "border-pine bg-pine text-white"
          : "border-line bg-panel text-ink hover:border-line-strong hover:bg-slate-tint/60"
      }`}
    >
      <span className="block text-[0.8125rem] font-medium leading-tight">{title}</span>
      <span
        className={`block text-[0.6875rem] leading-tight ${
          active ? "text-white/70" : "text-slate"
        }`}
      >
        {subtitle}
      </span>
    </button>
  );
}

function LiveBadge({ status }: { status: LiveStatus }) {
  const copy: Record<LiveStatus, { text: string; dot: string; tone: string }> = {
    live: { text: "live", dot: "bg-pine", tone: "text-pine" },
    connecting: { text: "connecting", dot: "bg-amber", tone: "text-amber" },
    offline: { text: "offline", dot: "bg-crimson", tone: "text-crimson" },
  };
  const { text, dot, tone } = copy[status];

  return (
    <span className={`flex items-center gap-1.5 font-mono text-[0.6875rem] ${tone}`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  );
}
