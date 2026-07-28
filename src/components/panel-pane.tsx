"use client";

import { useMemo, useState } from "react";

import { KpiRow, summarise } from "@/components/kpi-row";
import { PulseTrace } from "@/components/pulse-trace";
import { StageRail } from "@/components/stage-rail";
import type { LiveStatus } from "@/hooks/use-pipeline";
import { AD_SOURCE_LABEL, PRACTICE_LABEL } from "@/lib/pipeline";
import type { Snapshot } from "@/lib/snapshot";

export const ALL_CAMPAIGNS = "all";

type ScoreFilter = "all" | "high" | "mid" | "low" | "unscored";
type DateFilter  = "all" | "1h" | "today" | "7d" | "30d";
type StatusFilter = "all" | "needs_review" | "awaiting_reply" | "replied";

const SCORE_FILTERS: { id: ScoreFilter; label: string }[] = [
  { id: "all",      label: "All scores" },
  { id: "high",     label: "High 70+"   },
  { id: "mid",      label: "Mid 40–69"  },
  { id: "low",      label: "Low <40"    },
  { id: "unscored", label: "Unscored"   },
];

const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: "all",   label: "All time" },
  { id: "1h",    label: "Past hour" },
  { id: "today", label: "Past 24h" },
  { id: "7d",    label: "7 days"   },
  { id: "30d",   label: "30 days"  },
];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all",            label: "All statuses" },
  { id: "needs_review",   label: "Needs review" },
  { id: "awaiting_reply", label: "Awaiting reply" },
  { id: "replied",        label: "Replied" },
];

function cutoffMs(filter: DateFilter): number | null {
  const now = Date.now();
  if (filter === "1h")    return now - 60 * 60 * 1000;
  if (filter === "today") return now - 24 * 60 * 60 * 1000;
  if (filter === "7d")    return now - 7  * 24 * 60 * 60 * 1000;
  if (filter === "30d")   return now - 30 * 24 * 60 * 60 * 1000;
  return null;
}

/**
 * The right pane: what the agent has actually done to the database.
 *
 * Everything here is read straight from Postgres over Realtime. Nothing is
 * mirrored from the chat stream, so if the transcript and this pane ever
 * disagree, this pane is right.
 *
 * Scalability pattern (Linear / HubSpot):
 *   Search → Score filter → Date filter → Per-stage pagination (5 per group).
 * Each layer narrows independently; combined they keep the view scannable at
 * any lead volume.
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
  const [search,      setSearch]      = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [dateFilter,  setDateFilter]  = useState<DateFilter>("all");
  const [statusFilter,setStatusFilter]= useState<StatusFilter>("all");

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

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = cutoffMs(dateFilter);

    return scope.leads.filter((lead) => {
      // Name / ID search
      if (q) {
        const name = (lead.parsed?.full_name ?? "").toLowerCase();
        if (!name.includes(q) && !lead.id.toLowerCase().includes(q)) return false;
      }
      // Date range filter
      if (cutoff !== null && new Date(lead.updated_at).getTime() < cutoff) return false;
      // Score band filter
      if (scoreFilter === "unscored") return lead.score === null;
      if (scoreFilter === "high")     return lead.score !== null && lead.score >= 70;
      if (scoreFilter === "mid")      return lead.score !== null && lead.score >= 40 && lead.score < 70;
      if (scoreFilter === "low")      return lead.score !== null && lead.score < 40;
      // Status filter
      if (statusFilter === "needs_review"   && lead.parsed?.needs_human_review !== true) return false;
      if (statusFilter === "awaiting_reply" && lead.stage !== "contacted") return false;
      if (statusFilter === "replied"        && lead.stage !== "responded") return false;
      
      return true;
    });
  }, [scope.leads, search, scoreFilter, dateFilter, statusFilter]);

  const leadIds  = useMemo(() => new Set(filteredLeads.map((l) => l.id)), [filteredLeads]);
  const followups = useMemo(
    () => snapshot.followups.filter((row) => leadIds.has(row.lead_id)),
    [leadIds, snapshot.followups],
  );

  const isFiltered  = search.trim() !== "" || scoreFilter !== "all" || dateFilter !== "all" || statusFilter !== "all";
  const hiddenCount = scope.leads.length - filteredLeads.length;

  const clearAll = () => { setSearch(""); setScoreFilter("all"); setDateFilter("all"); setStatusFilter("all"); };

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      {/* Glass header */}
      <header className="shrink-0 border-b border-line/60 bg-panel/78 px-5 py-4 backdrop-blur-md">
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h2 className="label">Panel</h2>
          <LiveBadge status={status} />
        </div>
        <div
          className="scrollbar-slim -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5"
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

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
        {/* Pulse trace section */}
        <div className="px-5 pt-5">
          {/* Subtle pine glow behind the monitor */}
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl opacity-30 blur-2xl"
              style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(18,78,74,0.18) 0%, transparent 70%)" }}
            />
            <PulseTrace events={scope.events} leads={scope.leads} />
          </div>
        </div>

        {/* KPI section */}
        <div className="px-5 pt-5">
          <KpiRow summary={scope.summary} />
        </div>

        {/* Gradient divider */}
        <div className="mx-5 my-5">
          <hr className="gradient-rule" />
        </div>

        {/* Pipeline section */}
        <div className="px-5 pb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="label">
              Pipeline
              {isFiltered ? (
                <span className="ml-2 normal-case tracking-normal font-mono text-[0.65rem]">
                  {filteredLeads.length} of {scope.leads.length} leads
                </span>
              ) : (
                <span className="ml-2 normal-case tracking-normal font-mono text-[0.65rem]">
                  {scope.leads.length} leads
                </span>
              )}
            </h2>
            {isFiltered && (
              <button
                type="button"
                onClick={clearAll}
                className="font-mono text-[0.65rem] text-slate/50 transition-colors hover:text-pine"
              >
                Clear all ×
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate/35">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              aria-label="Search leads"
              className="search-input pl-9"
            />
          </div>

          {/* Score filters + Date filters — two labeled rows */}
          <div className="space-y-2.5 mb-4">
            {/* Row 1 — Score */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="label w-10 shrink-0">Score</span>
              <div className="flex flex-wrap gap-1.5">
                {SCORE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setScoreFilter(f.id)}
                    className={`filter-pill ${scoreFilter === f.id ? "filter-pill-active" : "filter-pill-inactive"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2 — Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="label w-10 shrink-0">Status</span>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={`filter-pill ${statusFilter === f.id ? "filter-pill-active" : "filter-pill-inactive"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3 — Date */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="label w-10 shrink-0">Date</span>
              <div className="flex flex-wrap gap-1.5">
                {DATE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDateFilter(f.id)}
                    className={`filter-pill ${dateFilter === f.id ? "filter-pill-active" : "filter-pill-inactive"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Hidden leads notice */}
          {isFiltered && hiddenCount > 0 && (
            <p className="mb-4 rounded-xl border border-amber/20 bg-amber-tint/50 px-3.5 py-2.5 font-mono text-[0.7rem] text-amber/80">
              {hiddenCount} lead{hiddenCount !== 1 ? "s" : ""} hidden by active filters
            </p>
          )}

          <StageRail
            leads={filteredLeads}
            followups={followups}
            now={snapshot.fetchedAt}
            isFiltered={isFiltered}
          />
        </div>
      </div>
    </div>
  );
}

function CampaignChip({
  active, onClick, title, subtitle,
}: {
  active: boolean; onClick: () => void; title: string; subtitle: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`group shrink-0 rounded-full px-3.5 py-2 text-left transition-all duration-200 ${
        active
          ? "bg-pine-gradient text-white shadow-[0_2px_12px_rgba(18,78,74,0.38),0_0_0_1px_rgba(18,78,74,0.12)]"
          : "border border-line bg-panel/90 text-ink hover:border-pine/25 hover:bg-pine-tint/50 hover:shadow-sm"
      }`}
    >
      <span className="block text-[0.8125rem] font-semibold leading-tight">{title}</span>
      <span className={`block text-[0.6875rem] leading-tight mt-0.5 ${active ? "text-white/65" : "text-slate"}`}>
        {subtitle}
      </span>
    </button>
  );
}

function LiveBadge({ status }: { status: LiveStatus }) {
  const map: Record<LiveStatus, { text: string; dot: string; tone: string }> = {
    live:       { text: "live",       dot: "bg-pine",    tone: "text-pine"    },
    connecting: { text: "connecting", dot: "bg-amber",   tone: "text-amber"   },
    offline:    { text: "offline",    dot: "bg-crimson", tone: "text-crimson" },
  };
  const { text, dot, tone } = map[status];
  return (
    <span className={`flex items-center gap-1.5 font-mono text-[0.65rem] ${tone}`}>
      <span className={`size-1.5 rounded-full ${dot} ${status !== "offline" ? "animate-pulse-dot" : ""}`} aria-hidden />
      {text}
    </span>
  );
}
