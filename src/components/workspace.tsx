"use client";

import { useCallback, useState } from "react";

import { ConsolePane } from "@/components/console-pane";
import { ALL_CAMPAIGNS, PanelPane } from "@/components/panel-pane";
import { Wordmark } from "@/components/wordmark";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { usePipeline } from "@/hooks/use-pipeline";
import type { Snapshot } from "@/lib/snapshot";

type MobileView = "console" | "panel";

/**
 * The two-pane workspace.
 *
 * Console left, panel right, both always visible on desktop — the single most
 * important decision in the interface. An account manager has to be able to
 * watch the pipeline change *while* the agent explains itself; putting the
 * pipeline behind a tab would turn every claim the agent makes into something
 * you have to go and verify.
 *
 * The panes share no state beyond the campaign selection. The console streams
 * from the agent endpoint, the panel reads from Postgres, and they agree
 * because the database is the only thing either of them trusts.
 */
export function Workspace({
  initial,
  loadError,
}: {
  initial: Snapshot;
  loadError: string | null;
}) {
  const { snapshot, status, refresh } = usePipeline(initial);
  const [campaignId, setCampaignId] = useState<string>(ALL_CAMPAIGNS);
  const [mobileView, setMobileView] = useState<MobileView>("console");

  const onSettled = useCallback(() => void refresh(), [refresh]);
  const chat = useAgentChat({ onSettled });

  return (
    <div className="flex h-full flex-col animate-fade-in">
      {loadError && (
        <p className="shrink-0 border-b border-crimson/30 bg-crimson-tint/80 px-4 py-2 font-mono text-[0.75rem] text-crimson backdrop-blur-sm">
          {loadError}
        </p>
      )}

      {/* Mobile chrome. A squeezed two-pane is worse than either pane alone, so
          below lg they stack behind a toggle instead of being compressed. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-panel/80 px-4 py-2.5 backdrop-blur-md lg:hidden">
        <Wordmark />
        {/* Pill-shaped tab toggle */}
        <div
          className="relative flex rounded-full border border-line bg-paper p-0.5"
          role="tablist"
          aria-label="Pane"
        >
          {/* Sliding pill indicator */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0.5 w-[calc(50%-2px)] rounded-full bg-ink transition-transform duration-250 ease-out"
            style={{
              transform: mobileView === "panel" ? "translateX(calc(100% + 2px))" : "translateX(2px)",
            }}
          />
          {(["console", "panel"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={mobileView === view}
              onClick={() => setMobileView(view)}
              className={`relative z-10 rounded-full px-3.5 py-1 text-[0.75rem] font-medium capitalize transition-colors duration-200 ${
                mobileView === view ? "text-white" : "text-slate"
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]">
        <section
          aria-label="Agent console"
          className={`min-h-0 ${mobileView === "console" ? "block" : "hidden"} lg:block`}
        >
          <ConsolePane
            items={chat.items}
            running={chat.running}
            onSend={chat.send}
            onStop={chat.stop}
            onReset={chat.reset}
          />
        </section>

        <section
          aria-label="Pipeline and performance"
          className={`min-h-0 ${mobileView === "panel" ? "block" : "hidden"} lg:block`}
        >
          <PanelPane
            snapshot={snapshot}
            status={status}
            campaignId={campaignId}
            onSelectCampaign={setCampaignId}
          />
        </section>
      </main>
    </div>
  );
}
