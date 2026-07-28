"use client";

import { useState } from "react";

import {
  narrateTool,
  safeParse,
  violationsOf,
  type ConsoleItem,
} from "@/lib/console";
import { TONE_CLASS, TONE_HEX } from "@/lib/pipeline";

type ToolItem = Extract<ConsoleItem, { kind: "tool" }>;

/**
 * One action, narrated.
 *
 * A card is not a debug log — it says what happened to which lead. Two cases
 * get expanded treatment because they are the product: a delegation to a
 * subagent (proof the harness is really splitting the work) and a compliance
 * outcome (the message, and either the verdict that cleared it or the
 * violations that stopped it reaching the database).
 */
export function ToolCard({ item }: { item: ToolItem }) {
  const narration = narrateTool(item);
  const input = safeParse(item.input) ?? {};
  const output = safeParse(item.output) ?? {};
  const violations = violationsOf(item.output);
  const running = item.status === "running";

  const todos = item.name === "write_todos" && Array.isArray(input.todos) ? input.todos : null;
  const isDelegation = item.name === "task";
  const draft = item.name === "draft_followup" ? String(input.content ?? "") : "";

  const toneHex = TONE_HEX[narration.tone];

  return (
    <div className={item.nested ? "ml-4 border-l-2 border-line pl-3" : ""}>
      <div
        className="overflow-hidden rounded-xl border border-line bg-panel transition-shadow duration-200 hover:shadow-[0_2px_12px_rgba(12,17,22,0.08)]"
        style={{
          borderLeft: `3px solid ${toneHex}`,
          boxShadow: running
            ? `0 0 0 1px ${toneHex}22, 0 2px 12px ${toneHex}18`
            : undefined,
        }}
      >
        {/* Header row */}
        <div className="flex items-start gap-2.5 px-3 py-2.5">
          {/* Tone dot — pulses when running */}
          <span
            className={`mt-[5px] size-2 shrink-0 rounded-full ${TONE_CLASS[narration.tone].dot}`}
            style={{
              animation: running
                ? `pulse-dot 1.6s ease-in-out infinite`
                : undefined,
              boxShadow: running ? `0 0 0 0 ${toneHex}` : undefined,
            }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className={`text-[0.8125rem] font-semibold ${TONE_CLASS[narration.tone].text}`}>
                {narration.title}
              </p>
              <code className="ml-auto shrink-0 rounded-sm bg-slate-tint px-1 py-px font-mono text-[0.6rem] text-slate/60">
                {item.name}
              </code>
            </div>
            {narration.detail && (
              <p className="mt-0.5 truncate text-[0.75rem] text-slate/80">
                {narration.detail}
              </p>
            )}
          </div>
        </div>

        {/* Todo plan list */}
        {todos && (
          <ol className="space-y-1 border-t border-line/60 bg-paper/60 px-3 py-2.5">
            {todos.map((todo: { content?: string; status?: string }, index: number) => (
              <li
                key={index}
                className="flex gap-2.5 text-[0.75rem] leading-snug text-slate"
              >
                <span className="mt-px font-mono text-[0.6rem] text-slate/50">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={
                    todo.status === "completed"
                      ? "line-through opacity-50"
                      : ""
                  }
                >
                  {todo.content}
                </span>
              </li>
            ))}
          </ol>
        )}

        {/* Delegation transcript */}
        {isDelegation && item.transcript.trim() && (
          <Disclosure summary="subagent output" defaultOpen={running}>
            <p className="whitespace-pre-wrap font-mono text-[0.6875rem] leading-relaxed text-slate">
              {item.transcript}
            </p>
          </Disclosure>
        )}

        {/* Approved message */}
        {item.name === "draft_followup" && !running && output.ok === true && draft && (
          <div className="border-t border-pine/20 bg-pine-tint/50 px-3 py-2.5">
            <p className="mb-1.5 label text-pine">message sent</p>
            <p className="whitespace-pre-wrap rounded-lg border border-pine/20 bg-panel px-3 py-2 text-[0.8125rem] leading-relaxed text-ink">
              {draft}
            </p>
          </div>
        )}

        {/* Compliance stop — nothing reached the database */}
        {violations.length > 0 && (
          <div className="border-t border-crimson/25 bg-crimson-tint/60 px-3 py-2.5">
            {draft && (
              <div className="mb-2.5 rounded-lg border border-crimson/25 bg-panel/70 px-3 py-2">
                <p className="mb-1 label text-crimson">blocked draft</p>
                <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-ink/60 line-through decoration-crimson/50 decoration-2">
                  {draft}
                </p>
              </div>
            )}
            <ul className="space-y-2">
              {violations.map((violation, index) => (
                <li key={index} className="rounded-lg border border-crimson/20 bg-panel/60 px-2.5 py-2 text-[0.75rem] leading-snug">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[0.6875rem] font-semibold text-crimson">
                      {violation.rule}
                    </span>
                    <span className="rounded bg-crimson/10 px-1.5 py-px font-mono text-[0.6875rem] text-crimson">
                      &ldquo;{violation.matched}&rdquo;
                    </span>
                  </div>
                  <span className="mt-0.5 block text-slate">{violation.why}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[0.6875rem] text-crimson">
              <span className="size-1.5 rounded-full bg-crimson" aria-hidden />
              nothing was written — the agent has to rewrite it
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Disclosure({
  summary,
  defaultOpen,
  children,
}: {
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="border-t border-line/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 font-mono text-[0.6875rem] text-slate/70 transition-colors hover:bg-slate-tint/40 hover:text-ink"
      >
        <span
          aria-hidden
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▸
        </span>
        {summary}
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto bg-paper/60 px-3 pb-3 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}
