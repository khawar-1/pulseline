import { createPulselineAgent, initialState } from "./graph";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/supabase/types";

/**
 * The agent turn runner.
 *
 * This is the entire "run one turn of the graph and persist both sides of
 * it" logic, extracted so it has exactly one implementation regardless of
 * who starts the turn: a human typing into the console (`/api/chat`,
 * `source: "human"`, streamed to the browser as SSE) or a webhook reacting
 * to a Google Form submission or a Twilio reply (`source: "system"`, no
 * browser waiting). Both callers get the same tools, the same subagents, and
 * the same compliance gate -- the only thing that differs is who supplied
 * the instruction text.
 */

export type TurnEventName =
  | "token"
  | "subagent_token"
  | "tool_start"
  | "tool_end"
  | "error"
  | "done";

export interface TurnEvent {
  event: TurnEventName;
  data: Record<string, unknown>;
}

/** A domain tool's parsed result, captured for callers that need to act on
 *  what the agent did -- e.g. a webhook route pulling `lead_id` back out of
 *  an `ingest_lead` call -- without re-parsing SSE frames. */
export interface DomainToolResult {
  name: string;
  output: unknown;
}

export interface RunTurnOptions {
  sessionId: string;
  message: string;
  /** 'human' for the chat route, 'system' for webhook-triggered turns. */
  source?: "human" | "system";
  /** Called for every stream frame. The chat route forwards these as SSE;
   *  webhook callers can omit it entirely. */
  onEvent?: (event: TurnEvent) => void;
  recursionLimit?: number;
}

export interface RunTurnResult {
  ok: boolean;
  assistantText: string;
  error?: string;
  toolResults: DomainToolResult[];
}

const DOMAIN_TOOL_NAMES = new Set([
  "query_leads",
  "ingest_lead",
  "score_lead",
  "draft_followup",
  "log_kpi_event",
  "get_campaign_kpis",
]);

/** Persisted history -> the shape the graph expects. */
function toGraphMessages(rows: ChatMessage[]) {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: typeof row.content === "string" ? row.content : JSON.stringify(row.content),
    }));
}

/** Tool payloads can be large; callers only ever want a summary. */
const MAX_PAYLOAD_CHARS = 6000;

/**
 * The tools whose *result* is worth rendering or inspecting -- scores,
 * compliance verdicts, violations, stage changes, counts.
 *
 * Everything else is narrated from its arguments. That matters because the
 * harness middleware tools return a LangGraph `Command` carrying the entire
 * virtual filesystem, so forwarding their output would push kilobytes of
 * playbook markdown down the wire on every planning step for nothing.
 */
const OUTPUT_IS_RENDERED = new Set(DOMAIN_TOOL_NAMES);

function clip(value: unknown): unknown {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (typeof text !== "string") return null;
  return text.length > MAX_PAYLOAD_CHARS
    ? `${text.slice(0, MAX_PAYLOAD_CHARS)}… [truncated]`
    : text;
}

/**
 * Normalise the tool arguments carried on `on_tool_start`.
 *
 * LangChain hands these over inconsistently depending on how the tool was
 * invoked: sometimes the argument object, sometimes a JSON string, and
 * sometimes that string wrapped one level deep as `{ input: "..." }`. This
 * gives every caller one predictable shape rather than three special cases
 * per tool.
 */
function normalizeToolInput(value: unknown, depth = 0): unknown {
  if (depth > 3) return value;

  if (typeof value === "string") {
    try {
      return normalizeToolInput(JSON.parse(value), depth + 1);
    } catch {
      return value;
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "input") {
      return normalizeToolInput((value as { input: unknown }).input, depth + 1);
    }
  }

  return value;
}

/** on_tool_end hands back either a raw string or a ToolMessage-shaped object. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toolOutputText(output: any): unknown {
  if (output == null) return null;
  if (typeof output === "string") return clip(output);

  // Domain tools return a JSON string; the filesystem middleware returns a
  // serialised ToolMessage, whose content is either a string or text blocks.
  const content = output.content ?? output.kwargs?.content;
  if (typeof content === "string") return clip(content);
  if (Array.isArray(content)) {
    return clip(
      content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((block: any) => (typeof block === "string" ? block : (block?.text ?? "")))
        .join(""),
    );
  }

  return clip(output);
}

/** Pull plain text out of a streamed chunk, whichever shape the provider uses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chunkText(chunk: any): string {
  if (typeof chunk?.content === "string") return chunk.content;
  // Some providers stream content as blocks rather than a plain string; keep
  // only the text ones.
  return (chunk?.content ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b?.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text ?? "")
    .join("");
}

export async function runAgentTurn(opts: RunTurnOptions): Promise<RunTurnResult> {
  const { sessionId, message, source = "human", onEvent, recursionLimit = 80 } = opts;
  const db = supabaseAdmin();
  const send = (event: TurnEventName, data: Record<string, unknown>) =>
    onEvent?.({ event, data });

  const { data: historyRows, error: historyError } = await db
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (historyError) {
    return { ok: false, assistantText: "", error: historyError.message, toolResults: [] };
  }

  const history = toGraphMessages((historyRows ?? []) as ChatMessage[]);

  await db.from("chat_messages").insert({ session_id: sessionId, role: "user", source, content: message });

  let agent: ReturnType<typeof createPulselineAgent>;
  try {
    agent = createPulselineAgent();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, assistantText: "", error: detail, toolResults: [] };
  }

  let assistantText = "";
  const toolResults: DomainToolResult[] = [];

  /** How many `task` calls are currently on the stack -- see route-level docs
   *  for why this matters (subagent token/tool nesting). */
  let taskDepth = 0;
  /** Open tool calls, keyed by name + arguments, to collapse the duplicate
   *  on_tool_start/end events a subagent's tools surface as they propagate
   *  out through the parent graph. */
  const openCalls = new Map<string, string>();
  const cardForRun = new Map<string, string>();

  try {
    const events = agent.streamEvents(
      initialState([...history, { role: "user", content: message }]),
      { version: "v2", recursionLimit },
    );

    for await (const event of events) {
      switch (event.event) {
        case "on_chat_model_stream": {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const text = chunkText((event.data as any)?.chunk);
          if (!text) break;

          if (taskDepth > 0) {
            send("subagent_token", { text });
          } else {
            assistantText += text;
            send("token", { text });
          }
          break;
        }

        case "on_tool_start": {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const input = clip(normalizeToolInput((event.data as any)?.input));
          const signature = `${event.name}:${String(input)}`;
          const existing = openCalls.get(signature);

          if (existing) {
            cardForRun.set(event.run_id, existing);
            break;
          }

          openCalls.set(signature, event.run_id);
          cardForRun.set(event.run_id, event.run_id);
          send("tool_start", {
            id: event.run_id,
            name: event.name,
            nested: taskDepth > 0,
            input,
          });
          if (event.name === "task") taskDepth += 1;
          break;
        }

        case "on_tool_end": {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const input = clip(normalizeToolInput((event.data as any)?.input));
          const signature = `${event.name}:${String(input)}`;
          const id = cardForRun.get(event.run_id) ?? openCalls.get(signature) ?? event.run_id;

          cardForRun.delete(event.run_id);
          openCalls.delete(signature);
          for (const [sig, cardId] of openCalls) {
            if (cardId === id) openCalls.delete(sig);
          }

          if (event.name === "task") taskDepth = Math.max(0, taskDepth - 1);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawOutput = (event.data as any)?.output;
          const output = OUTPUT_IS_RENDERED.has(event.name) ? toolOutputText(rawOutput) : null;

          if (DOMAIN_TOOL_NAMES.has(event.name)) {
            const parsed = typeof output === "string" ? safeJsonParse(output) : output;
            toolResults.push({ name: event.name, output: parsed });
          }

          send("tool_end", { id, name: event.name, output });
          break;
        }
      }
    }

    if (assistantText.trim()) {
      await db.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        source,
        content: assistantText,
      });
    }

    send("done", { ok: true });
    return { ok: true, assistantText, toolResults };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[run-turn] agent run failed:", detail);
    if (assistantText.trim()) {
      await db.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        source,
        content: assistantText,
      });
    }
    send("error", { error: detail });
    return { ok: false, assistantText, error: detail, toolResults };
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
