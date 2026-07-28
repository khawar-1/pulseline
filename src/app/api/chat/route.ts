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

      try {
        const events = agent.streamEvents(
          initialState([...history, { role: "user", content: message }]),
          { version: "v2", recursionLimit: 80 },
        );

        for await (const event of events) {
          switch (event.event) {
            case "on_chat_model_stream": {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const chunk = (event.data as any)?.chunk;
              const text =
                typeof chunk?.content === "string"
                  ? chunk.content
                  : // Some providers stream content as blocks rather than a
                    // plain string; keep only the text ones.
                    (chunk?.content ?? [])
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .filter((b: any) => b?.type === "text")
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .map((b: any) => b.text ?? "")
                      .join("");
              if (text) {
                assistantText += text;
                send("token", { text });
              }
              break;
            }

            // Tool activity is surfaced so the UI can show what the agent is
            // doing while it works — the pipeline pane reacts to the resulting
            // database writes via Realtime, but the narration comes from here.
            case "on_tool_start":
              send("tool_start", { name: event.name });
              break;

            case "on_tool_end":
              send("tool_end", { name: event.name });
              break;
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
