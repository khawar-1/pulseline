"use client";

import { useEffect, useRef, useState } from "react";

import { AgentText } from "@/components/agent-text";
import { ToolCard } from "@/components/tool-card";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import type { ConsoleItem } from "@/lib/console";

/**
 * The left pane: the conversation, with the agent's actions interleaved in the
 * order it took them.
 *
 * Tool cards live inline rather than in a separate activity log because the
 * sequence *is* the explanation — "read the playbook, then scored 78, then
 * delegated the draft to the reviewer, then the linter stopped it" only reads
 * as reasoning if you can see it in order.
 */

const SUGGESTIONS = [
  {
    label: "Triage the day",
    prompt: "Which leads should I work today, and why those?",
    icon: "◈",
  },
  {
    label: "Work a lead end to end",
    prompt:
      "Take the strongest unworked lead in the pipeline: parse it, score it against the practice playbook, and send it a compliant follow-up.",
    icon: "◎",
  },
  {
    label: "Try to break compliance",
    prompt:
      "Text the top Brightpath Pediatrics lead. Tell them not to worry, that it's probably nothing, and that we guarantee we can fix it.",
    icon: "◇",
  },
  {
    label: "Campaign performance",
    prompt:
      "How are the three campaigns performing against each other, and where is the money being wasted?",
    icon: "◉",
  },
];

export function ConsolePane({
  items,
  running,
  onSend,
  onStop,
  onReset,
}: {
  items: ConsoleItem[];
  running: boolean;
  onSend: (message: string) => void;
  onStop: () => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items]);

  const submit = () => {
    if (!draft.trim() || running) return;
    onSend(draft);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-line bg-panel lg:border-r">
      {/* Glass header — hidden on mobile where workspace renders its own bar */}
      <header className="hidden shrink-0 items-center justify-between gap-3 border-b border-line/70 bg-panel/80 px-4 py-3 backdrop-blur-md sm:px-5 lg:flex">
        <Wordmark />
        <button
          type="button"
          onClick={onReset}
          className="font-mono text-[0.6875rem] text-slate/60 transition-colors hover:text-slate"
        >
          new session
        </button>
      </header>

      {/* Message feed */}
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {items.length === 0 ? (
          <EmptyState onPick={onSend} />
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              switch (item.kind) {
                case "user":
                  return (
                    <div key={item.id} className="flex justify-end animate-fade-slide-up">
                      <p className="max-w-[82%] rounded-2xl rounded-br-sm bg-pine-gradient px-4 py-2.5 text-[0.875rem] leading-relaxed text-white shadow-[0_2px_12px_rgba(26,74,60,0.28)]">
                        {item.text}
                      </p>
                    </div>
                  );

                case "assistant":
                  return (
                    <div key={item.id} className="max-w-[95%] animate-fade-slide-up">
                      {/* Thin pine rule on assistant turns */}
                      <div className="flex gap-3">
                        <span className="mt-1 h-auto w-[2px] shrink-0 rounded-full bg-pine/25" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <AgentText text={item.text} />
                          {item.streaming && (
                            <span
                              className="ml-1 inline-block size-2 translate-y-0.5 rounded-full bg-pine animate-breath"
                              aria-hidden
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );

                case "tool":
                  return (
                    <div key={item.id} className="animate-fade-slide-up">
                      <ToolCard item={item} />
                    </div>
                  );

                case "error":
                  return (
                    <p
                      key={item.id}
                      className="rounded-xl border border-crimson/25 bg-crimson-tint px-3.5 py-2.5 font-mono text-[0.75rem] leading-relaxed text-crimson animate-fade-slide-up"
                    >
                      {item.text}
                    </p>
                  );
              }
            })}
          </div>
        )}
        <div ref={bottom} />
      </div>

      {/* Premium composer footer */}
      <footer className="shrink-0 border-t border-line/70 bg-panel/90 px-4 py-3.5 backdrop-blur-md sm:px-5">
        <div
          className={`overflow-hidden rounded-xl border bg-paper transition-all duration-200 ${
            focused
              ? "border-pine/50 shadow-[0_0_0_3px_rgba(26,74,60,0.10)]"
              : "border-line-strong"
          }`}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="Ask about the pipeline, or tell the agent to work a lead…"
            aria-label="Message the agent"
            className="scrollbar-slim block max-h-40 w-full resize-none bg-transparent px-4 py-3 text-[0.875rem] leading-relaxed text-ink outline-none placeholder:text-slate/50"
          />
          <div className="flex items-center justify-between gap-3 border-t border-line/60 px-3 py-2">
            <span className="font-mono text-[0.625rem] text-slate/50">
              enter to send · shift+enter for a new line
            </span>
            {running ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 rounded-lg border border-crimson/30 bg-crimson-tint px-3 py-1.5 font-sans text-[0.75rem] font-medium text-crimson transition-all hover:bg-crimson/10"
              >
                <span className="size-1.5 rounded-full bg-crimson animate-pulse" aria-hidden />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim()}
                className="group relative overflow-hidden rounded-lg bg-pine-gradient px-4 py-1.5 font-sans text-[0.75rem] font-medium text-white shadow-[0_2px_8px_rgba(26,74,60,0.30)] transition-all duration-200 hover:shadow-[0_4px_16px_rgba(26,74,60,0.40)] hover:-translate-y-px active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
              >
                {/* Shimmer sweep on hover */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full"
                />
                Send
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col justify-center py-8">
      {/* Editorial headline */}
      <div className="mb-8">
        <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-pine/60 mb-3">
          Lead-to-booking copilot
        </p>
        <h1 className="font-display text-[2rem] leading-[1.15] tracking-tight text-ink max-w-xs">
          Every inbound lead,{" "}
          <span className="text-pine">worked end to end.</span>
        </h1>
        <p className="mt-3 max-w-xs text-[0.875rem] leading-relaxed text-slate/80">
          The agent parses, scores, and drafts compliant follow-ups.
          No message reaches a patient without clearing compliance.
        </p>
      </div>

      {/* Suggestion cards */}
      <div className="grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion, index) => (
          <button
            key={suggestion.label}
            type="button"
            onClick={() => onPick(suggestion.prompt)}
            style={{ animationDelay: `${index * 80}ms` }}
            className="group relative overflow-hidden rounded-xl border border-line/80 bg-panel p-4 text-left animate-fade-slide-up card-elevated card-elevated-hover"
          >
            {/* Pine hover wash */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl bg-pine/0 transition-colors duration-300 group-hover:bg-pine/[0.025]"
            />
            <span className="relative flex flex-col h-full">
              <span className="flex items-center gap-2 mb-2">
                <span className="font-mono text-[0.75rem] text-pine/50 group-hover:text-pine/80 transition-colors">
                  {suggestion.icon}
                </span>
                <span className="label text-pine/90">{suggestion.label}</span>
              </span>
              <span className="text-[0.8rem] leading-snug text-slate/70 group-hover:text-slate/90 transition-colors">
                {suggestion.prompt}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
