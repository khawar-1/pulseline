import { runAgentTurn } from "@/agent/run-turn";

/**
 * The chat endpoint.
 *
 * Pure HTTP plumbing: parse the request, open an SSE stream, and forward
 * every frame `runAgentTurn` produces. The compiled LangGraph runs
 * in-process via that shared runner rather than behind a separate service --
 * that removes the failure mode where a reviewer opens the live URL and the
 * agent host is cold-starting or asleep, at the cost of Vercel's function
 * duration limit, which is why this streams.
 *
 * `runAgentTurn` (src/agent/run-turn.ts) is the single implementation of
 * "run one turn and persist both sides of it" -- the webhook routes under
 * `src/app/api/webhooks/` call the exact same function with `source:
 * "system"` instead of forwarding to a browser.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatRequest {
  session_id: string;
  message: string;
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      await runAgentTurn({
        sessionId: session_id,
        message,
        source: "human",
        onEvent: (evt) => controller.enqueue(encoder.encode(sse(evt.event, evt.data))),
      });
      controller.close();
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
