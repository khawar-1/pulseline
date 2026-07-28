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

  return (
    <div className={item.nested ? "ml-4 border-l border-line pl-3" : ""}>
      <div
        className="rounded-md border border-line bg-panel"
        style={{ borderLeft: `2px solid ${TONE_HEX[narration.tone]}` }}
      >
        <div className="flex items-start gap-2 px-2.5 py-2">
          <span
            className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE_CLASS[narration.tone].dot} ${
              running ? "animate-pulse" : ""
            }`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className={`text-[0.8125rem] font-medium ${TONE_CLASS[narration.tone].text}`}>
                {narration.title}
              </p>
              <code className="ml-auto shrink-0 font-mono text-[0.625rem] text-slate/70">
                {item.name}
              </code>
            </div>
            {narration.detail && (
              <p className="mt-0.5 truncate text-[0.75rem] text-slate">
                {narration.detail}
              </p>
            )}
          </div>
        </div>

        {todos && (
          <ol className="space-y-1 border-t border-line px-2.5 py-2">
            {todos.map((todo: { content?: string; status?: string }, index: number) => (
              <li
                key={index}
                className="flex gap-2 text-[0.75rem] leading-snug text-slate"
              >
                <span className="font-mono text-[0.6875rem] text-slate/60">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={todo.status === "completed" ? "line-through opacity-60" : ""}>
                  {todo.content}
                </span>
              </li>
            ))}
          </ol>
        )}

        {isDelegation && item.transcript.trim() && (
          <Disclosure summary="subagent output" defaultOpen={running}>
            <p className="whitespace-pre-wrap font-mono text-[0.6875rem] leading-relaxed text-slate">
              {item.transcript}
            </p>
          </Disclosure>
        )}

        {/* The message itself, once it has cleared review. */}
        {item.name === "draft_followup" && !running && output.ok === true && draft && (
          <div className="border-t border-line bg-pine-tint/40 px-2.5 py-2">
            <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-ink">
              {draft}
            </p>
          </div>
        )}

        {/* The stop. Nothing was written to the database. */}
        {violations.length > 0 && (
          <div className="border-t border-crimson/20 bg-crimson-tint/50 px-2.5 py-2">
            {draft && (
              <p className="mb-2 whitespace-pre-wrap border-l-2 border-crimson/40 pl-2 text-[0.8125rem] leading-relaxed text-ink/70 line-through decoration-crimson/40">
                {draft}
              </p>
            )}
            <ul className="space-y-1.5">
              {violations.map((violation, index) => (
                <li key={index} className="text-[0.75rem] leading-snug">
                  <span className="font-mono text-[0.6875rem] font-medium text-crimson">
                    {violation.rule}
                  </span>
                  <span className="ml-1.5 rounded-sm bg-crimson/10 px-1 font-mono text-[0.6875rem] text-crimson">
                    “{violation.matched}”
                  </span>
                  <span className="mt-0.5 block text-slate">{violation.why}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-crimson/20 pt-1.5 font-mono text-[0.6875rem] text-crimson">
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
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 font-mono text-[0.6875rem] text-slate transition-colors hover:text-ink"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        {summary}
      </button>
      {open && <div className="max-h-56 overflow-y-auto px-2.5 pb-2">{children}</div>}
    </div>
  );
}
