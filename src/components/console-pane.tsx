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
  },
  {
    label: "Work a lead end to end",
    prompt:
      "Take the strongest unworked lead in the pipeline: parse it, score it against the practice playbook, and send it a compliant follow-up.",
  },
  {
    label: "Try to break compliance",
    prompt:
      "Text the top Brightpath Pediatrics lead. Tell them not to worry, that it's probably nothing, and that we guarantee we can fix it.",
  },
  {
    label: "Campaign performance",
    prompt:
      "How are the three campaigns performing against each other, and where is the money being wasted?",
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
      {/* Below lg the workspace renders its own bar with the pane toggle, so
          this one would be a second copy of the same wordmark. */}
      <header className="hidden shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 lg:flex">
        <Wordmark />
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="font-mono text-[0.6875rem] text-slate"
        >
          new session
        </Button>
      </header>

      <div className="scrollbar-slim min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {items.length === 0 ? (
          <EmptyState onPick={onSend} />
        ) : (
          items.map((item) => {
            switch (item.kind) {
              case "user":
                return (
                  <p
                    key={item.id}
                    className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-ink px-3 py-2 text-[0.875rem] leading-relaxed text-white"
                  >
                    {item.text}
                  </p>
                );

              case "assistant":
                return (
                  <div key={item.id} className="max-w-[95%]">
                    <AgentText text={item.text} />
                    {item.streaming && (
                      <span
                        className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-pine"
                        aria-hidden
                      />
                    )}
                  </div>
                );

              case "tool":
                return <ToolCard key={item.id} item={item} />;

              case "error":
                return (
                  <p
                    key={item.id}
                    className="rounded-md border border-crimson/30 bg-crimson-tint px-3 py-2 font-mono text-[0.75rem] leading-relaxed text-crimson"
                  >
                    {item.text}
                  </p>
                );
            }
          })
        )}
        <div ref={bottom} />
      </div>

      <footer className="shrink-0 border-t border-line bg-panel px-4 py-3 sm:px-5">
        <div className="rounded-lg border border-line-strong bg-paper focus-within:border-pine">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="Ask about the pipeline, or tell the agent to work a lead…"
            aria-label="Message the agent"
            className="scrollbar-slim block max-h-40 w-full resize-none bg-transparent px-3 py-2.5 text-[0.875rem] leading-relaxed text-ink outline-none placeholder:text-slate/70"
          />
          <div className="flex items-center justify-between gap-3 border-t border-line px-2 py-1.5">
            <span className="font-mono text-[0.625rem] text-slate/70">
              enter to send · shift+enter for a new line
            </span>
            {running ? (
              <Button variant="outline" size="sm" onClick={onStop}>
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={submit} disabled={!draft.trim()}>
                Send
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="py-6">
      <p className="max-w-md font-display text-[1.5rem] leading-snug text-ink">
        Inbound patient leads, worked end to end — and no message reaches a
        patient without clearing compliance.
      </p>
      <p className="mt-2 max-w-md text-[0.875rem] leading-relaxed text-slate">
        The agent parses ad-form submissions, scores booking likelihood against
        the practice playbook, and drafts follow-ups. Everything it does lands in
        the panel on the right as it happens.
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            onClick={() => onPick(suggestion.prompt)}
            className="rounded-md border border-line bg-paper p-2.5 text-left transition-colors hover:border-pine/40 hover:bg-pine-tint/40"
          >
            <span className="label block text-pine">{suggestion.label}</span>
            <span className="mt-1 block text-[0.8125rem] leading-snug text-slate">
              {suggestion.prompt}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
