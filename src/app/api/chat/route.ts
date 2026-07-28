import { createPulselineAgent, initialState } from "@/agent/graph";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/supabase/types";

/**
 * The agent server.
 *
 * The compiled LangGraph runs in-process here rather than behind a separate
 * service. That removes the failure mode where a reviewer opens the live URL
 * and the agent host is cold-starting or asleep — at the cost of Vercel's
 * function duration limit, which is why this streams.
 *
 * Conversation history is replayed from Supabase instead of a LangGraph
 * checkpointer. A Postgres checkpointer over serverless needs pooled
 * connections and careful lifecycle handling; replaying a short message list is
 * a few lines and cannot half-fail.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatRequest {
  session_id: string;
  message: string;
}

/** Persisted history -> the shape the graph expects. */
function toGraphMessages(rows: ChatMessage[]) {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: typeof row.content === "string" ? row.content : JSON.stringify(row.content),
    }));
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Tool payloads can be large; the console only ever renders a summary. */
const MAX_PAYLOAD_CHARS = 6000;

/**
 * The tools whose *result* the console actually renders — scores, compliance
 * verdicts, violations, stage changes, counts.
 *
 * Everything else is narrated from its arguments. That matters because the
 * harness middleware tools return a LangGraph `Command` carrying the entire
 * virtual filesystem, so forwarding their output would push kilobytes of
 * playbook markdown down the wire on every planning step for nothing.
 */
const OUTPUT_IS_RENDERED = new Set([
  "query_leads",
  "ingest_lead",
  "score_lead",
  "draft_followup",
  "log_kpi_event",
  "get_campaign_kpis",
]);

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
 * sometimes that string wrapped one level deep as `{ input: "..." }`. The
 * console narrates from these fields — "scored 78", "channel: sms" — so it
 * gets one predictable shape rather than three special cases per tool.
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

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Request body was not valid JSON." }, { status: 400 });
  }

  const { session_id, message } = body;
  if (!session_id || !message?.trim()) {
    return Response.json(
      { error: "Both session_id and a non-empty message are required." },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  const { data: historyRows, error: historyError } = await db
    .from("chat_messages")
    .select("*")
    .eq("session_id", session_id)
    .order("created_at", { ascending: true });

  if (historyError) {
    return Response.json(
      { error: `Could not load conversation history: ${historyError.message}` },
      { status: 500 },
    );
  }

  const history = toGraphMessages((historyRows ?? []) as ChatMessage[]);

  await db.from("chat_messages").insert({
    session_id,
    role: "user",
    content: message,
  });

  let agent: ReturnType<typeof createPulselineAgent>;
  try {
    agent = createPulselineAgent();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Agent failed to start." },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));

      let assistantText = "";

      /**
       * How many `task` calls are currently on the stack.
       *
       * streamEvents flattens the subagents' runs into the same stream as the
       * main agent's, so without this the compliance reviewer's private
       * reasoning would land in the transcript as if the main agent had said
       * it. Tracking depth lets the UI nest a subagent's tokens and tool calls
       * inside the delegation that caused them — which is also the clearest way
       * to *show* that delegation is really happening.
       */
      let taskDepth = 0;

      /**
       * Open tool calls, keyed by name + arguments.
       *
       * A tool invoked inside a subagent surfaces on this stream more than
       * once, under a different `run_id` each time, because the event is
       * emitted for the inner run and again as it propagates out through the
       * parent graph. Correlating on the call signature instead of the run id
       * collapses those into the one action the user actually cares about, and
       * gives `tool_end` a stable id to close.
       */
      const openCalls = new Map<string, string>();
      /** Every run id seen for a call, pointing at the card the console opened. */
      const cardForRun = new Map<string, string>();

      try {
        const events = agent.streamEvents(
          initialState([...history, { role: "user", content: message }]),
          { version: "v2", recursionLimit: 80 },
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
                // Only the main agent's words are the answer, and only they
                // get persisted to the transcript.
                assistantText += text;
                send("token", { text });
              }
              break;
            }

            // Tool activity is surfaced so the console can narrate what the
            // agent is doing while it works. The pipeline pane reacts to the
            // resulting database writes over Realtime; the narration comes
            // from here.
            case "on_tool_start": {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const input = clip(normalizeToolInput((event.data as any)?.input));
              const signature = `${event.name}:${String(input)}`;
              const existing = openCalls.get(signature);

              if (existing) {
                // A repeat of a call already on screen. Remember the run id so
                // whichever one closes can still find the right card.
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
              const id =
                cardForRun.get(event.run_id) ?? openCalls.get(signature) ?? event.run_id;

              cardForRun.delete(event.run_id);
              openCalls.delete(signature);
              for (const [sig, cardId] of openCalls) {
                if (cardId === id) openCalls.delete(sig);
              }

              if (event.name === "task") taskDepth = Math.max(0, taskDepth - 1);

              send("tool_end", {
                id,
                name: event.name,
                output: OUTPUT_IS_RENDERED.has(event.name)
                  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    toolOutputText((event.data as any)?.output)
                  : null,
              });
              break;
            }
          }
        }

        if (assistantText.trim()) {
          await db.from("chat_messages").insert({
            session_id,
            role: "assistant",
            content: assistantText,
          });
        }

        send("done", { ok: true });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("[chat] agent run failed:", detail);
        // Save whatever was produced before the failure so the transcript does
        // not silently lose a partial answer.
        if (assistantText.trim()) {
          await db.from("chat_messages").insert({
            session_id,
            role: "assistant",
            content: assistantText,
          });
        }
        send("error", { error: detail });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
