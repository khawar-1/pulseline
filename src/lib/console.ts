import type { Tone } from "@/lib/pipeline";

/**
 * How the console narrates the agent's work.
 *
 * The transcript is the demo. An account manager watching a wall of
 * `tool_call: score_lead` learns nothing; what they need to see is which lead
 * was scored, what it scored, and — above all — when a message was stopped.
 * So every tool gets a hand-written line rather than a generic "calling tool"
 * row, and the compliance outcomes get their own visual treatment.
 */

export type ConsoleItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "error"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      nested: boolean;
      input: unknown;
      output: unknown;
      /** Live text from a delegated subagent, shown inside its task card. */
      transcript: string;
      status: "running" | "done";
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeParse(raw: unknown): any {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export interface ToolNarration {
  /** Short, past-or-present tense, human. */
  title: string;
  /** One line of specifics, or null. */
  detail: string | null;
  tone: Tone;
  /** Set when this row is a compliance outcome and deserves the full card. */
  compliance: "blocked" | "cleared" | null;
}

const SHORT = (id: unknown) =>
  typeof id === "string" && id.length >= 8 ? id.slice(0, 8) : null;

/** Built-in deepagents middleware tools, which have no domain meaning. */
const HARNESS_TOOLS = new Set([
  "write_todos",
  "task",
  "ls",
  "read_file",
  "write_file",
  "edit_file",
  "glob",
  "grep",
]);

export function isHarnessTool(name: string): boolean {
  return HARNESS_TOOLS.has(name);
}

export function narrateTool(item: {
  name: string;
  input: unknown;
  output: unknown;
  status: "running" | "done";
}): ToolNarration {
  const input = safeParse(item.input) ?? {};
  const output = safeParse(item.output) ?? {};
  const running = item.status === "running";

  switch (item.name) {
    case "write_todos": {
      const todos = Array.isArray(input.todos) ? input.todos : [];
      return {
        title: "Planned the work",
        detail: todos.length ? `${todos.length} steps` : null,
        tone: "slate",
        compliance: null,
      };
    }

    case "task": {
      const to = input.subagent_type ?? "subagent";
      return {
        title: running ? `Delegating to ${to}` : `Delegated to ${to}`,
        detail: typeof input.description === "string" ? input.description : null,
        tone: to === "compliance-reviewer" ? "pine" : "slate",
        compliance: null,
      };
    }

    case "read_file":
      return {
        title: "Read the playbook",
        detail: input.file_path ?? null,
        tone: "slate",
        compliance: null,
      };

    case "ls":
    case "glob":
    case "grep":
    case "write_file":
    case "edit_file":
      return {
        title: item.name.replace("_", " "),
        detail: input.file_path ?? input.path ?? null,
        tone: "slate",
        compliance: null,
      };

    case "query_leads": {
      const filters = [
        input.stage && `stage ${input.stage}`,
        input.practice_type,
        input.needs_work && "needs work",
        typeof input.min_score === "number" && `score ≥ ${input.min_score}`,
      ].filter(Boolean);
      return {
        title: running ? "Reading the pipeline" : `Read ${output.count ?? 0} leads`,
        detail: filters.length ? filters.join(" · ") : null,
        tone: "slate",
        compliance: null,
      };
    }

    case "ingest_lead":
      return {
        title: running ? "Parsing the form submission" : "Parsed the form submission",
        detail: output.parsed?.full_name ?? SHORT(input.lead_id),
        tone: "slate",
        compliance: null,
      };

    case "score_lead": {
      if (running) {
        return {
          title: "Scoring",
          detail: SHORT(input.lead_id),
          tone: "slate",
          compliance: null,
        };
      }
      if (output.ok === false) {
        return {
          title: "Score rejected",
          detail: output.error ?? null,
          tone: "crimson",
          compliance: null,
        };
      }
      const capped =
        Array.isArray(output.caps_applied) && output.caps_applied.length > 0;
      return {
        title: `Scored ${output.final_score ?? "—"} / 100`,
        detail: [
          output.practice,
          capped && `capped from ${output.submitted_score}`,
          output.needs_human_review && "flagged for human review",
        ]
          .filter(Boolean)
          .join(" · ") || null,
        tone: output.needs_human_review
          ? "crimson"
          : (output.final_score ?? 0) >= 70
            ? "pine"
            : "amber",
        compliance: null,
      };
    }

    case "draft_followup": {
      if (running) {
        return {
          title: `Saving the ${input.channel ?? ""} follow-up`.trim(),
          detail: null,
          tone: "slate",
          compliance: null,
        };
      }
      // The interesting case: the deterministic linter refused to write it.
      if (Array.isArray(output.violations) && output.violations.length > 0) {
        return {
          title: "Message blocked — not saved",
          detail: `${output.violations.length} compliance ${
            output.violations.length === 1 ? "violation" : "violations"
          }`,
          tone: "crimson",
          compliance: "blocked",
        };
      }
      if (output.ok === false) {
        return {
          title: output.escalate_to_human
            ? "Refused — escalated to a human"
            : "Follow-up not saved",
          detail: output.error ?? null,
          tone: "crimson",
          compliance: output.escalate_to_human ? "blocked" : null,
        };
      }
      return {
        title: `Sent a compliant ${output.channel ?? "message"}`,
        detail: `review: ${output.compliance_verdict ?? "—"} · ${
          output.characters ?? "?"
        } chars`,
        tone: "pine",
        compliance: "cleared",
      };
    }

    case "log_kpi_event": {
      const change = output.stage_change;
      return {
        title: running
          ? "Moving the lead"
          : change?.logged
            ? `${change.from} → ${change.to}`
            : "Stage unchanged",
        detail: output.campaign_kpis?.practice ?? null,
        tone: change?.to === "booked" ? "pine" : change?.to === "lost" ? "crimson" : "amber",
        compliance: null,
      };
    }

    case "get_campaign_kpis":
      return {
        title: running ? "Reading performance" : "Read campaign performance",
        detail: null,
        tone: "slate",
        compliance: null,
      };

    default:
      return { title: item.name, detail: null, tone: "slate", compliance: null };
  }
}

export interface Violation {
  rule: string;
  matched: string;
  why: string;
}

export function violationsOf(output: unknown): Violation[] {
  const parsed = safeParse(output);
  return Array.isArray(parsed?.violations) ? (parsed.violations as Violation[]) : [];
}
