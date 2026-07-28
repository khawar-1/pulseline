"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ConsoleItem } from "@/lib/console";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/supabase/types";

const SESSION_KEY = "pulseline.session";

function readSessionId(): string {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, fresh);
  return fresh;
}

/**
 * Drives the console: sends a turn, consumes the SSE stream, and keeps the
 * transcript in arrival order so tool cards appear exactly where the agent
 * produced them rather than being collected at the end.
 *
 * History comes from Supabase directly (anon key, read-only) rather than a
 * second API route — the route handler already writes both sides of every turn
 * to `chat_messages`, so the browser can just read the table it is already
 * connected to.
 */
export function useAgentChat(options: { onSettled?: () => void } = {}) {
  const { onSettled } = options;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<ConsoleItem[]>([]);
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    setSessionId(readSessionId());
  }, []);

  // Replay the transcript so a refresh mid-demo does not lose the conversation.
  useEffect(() => {
    if (!sessionId || loadedFor.current === sessionId) return;
    loadedFor.current = sessionId;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabaseBrowser()
          .from("chat_messages")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });

        if (cancelled) return;
        setItems(
          ((data ?? []) as ChatMessage[])
            .filter((row) => row.role === "user" || row.role === "assistant")
            .map((row) => {
              const text =
                typeof row.content === "string"
                  ? row.content
                  : JSON.stringify(row.content);
              return row.role === "user"
                ? ({ kind: "user", id: row.id, text } as const)
                : ({ kind: "assistant", id: row.id, text, streaming: false } as const);
            }),
        );
      } catch (error) {
        console.error("[console] could not load history:", error);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /** Append streamed text to the open assistant bubble, or start a new one. */
  const appendAssistant = useCallback((text: string) => {
    setItems((current) => {
      const last = current[current.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        return [...current.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [
        ...current,
        { kind: "assistant", id: crypto.randomUUID(), text, streaming: true },
      ];
    });
  }, []);

  /** Subagent output belongs to the task card that spawned it, not the answer. */
  const appendSubagent = useCallback((text: string) => {
    setItems((current) => {
      for (let i = current.length - 1; i >= 0; i -= 1) {
        const item = current[i];
        if (item.kind === "tool" && item.name === "task" && item.status === "running") {
          const next = [...current];
          next[i] = { ...item, transcript: item.transcript + text };
          return next;
        }
      }
      return current;
    });
  }, []);

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || !sessionId || running) return;

      setRunning(true);
      setItems((current) => [
        ...current,
        { kind: "user", id: crypto.randomUUID(), text },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      const seal = () =>
        setItems((current) =>
          current.map((item) =>
            item.kind === "assistant" && item.streaming
              ? { ...item, streaming: false }
              : item.kind === "tool" && item.status === "running"
                ? { ...item, status: "done" as const }
                : item,
          ),
        );

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, message: text }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => "");
          throw new Error(detail || `The agent endpoint returned ${response.status}.`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Minimal SSE reader. Frames are separated by a blank line; the server
        // only ever emits single-line `data:` payloads.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const eventLine = frame.match(/^event: (.+)$/m)?.[1];
            const dataLine = frame.match(/^data: (.*)$/m)?.[1];
            if (!eventLine || dataLine === undefined) continue;

            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(dataLine);
            } catch {
              continue;
            }

            switch (eventLine) {
              case "token":
                appendAssistant(String(payload.text ?? ""));
                break;

              case "subagent_token":
                appendSubagent(String(payload.text ?? ""));
                break;

              case "tool_start":
                setItems((current) => [
                  ...current,
                  {
                    kind: "tool",
                    id: String(payload.id ?? crypto.randomUUID()),
                    name: String(payload.name ?? "tool"),
                    nested: Boolean(payload.nested),
                    input: payload.input ?? null,
                    output: null,
                    transcript: "",
                    status: "running",
                  },
                ]);
                break;

              case "tool_end":
                setItems((current) =>
                  current.map((item) =>
                    item.kind === "tool" && item.id === payload.id
                      ? { ...item, output: payload.output ?? null, status: "done" }
                      : item,
                  ),
                );
                break;

              case "error":
                seal();
                setItems((current) => [
                  ...current,
                  {
                    kind: "error",
                    id: crypto.randomUUID(),
                    text: String(payload.error ?? "The run failed."),
                  },
                ]);
                break;
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setItems((current) => [
            ...current,
            {
              kind: "error",
              id: crypto.randomUUID(),
              text: error instanceof Error ? error.message : String(error),
            },
          ]);
        }
      } finally {
        seal();
        setRunning(false);
        abortRef.current = null;
        // The agent's writes land over Realtime, but a final read closes the
        // gap if a change event was missed while the tab was backgrounded.
        onSettled?.();
      }
    },
    [appendAssistant, appendSubagent, onSettled, running, sessionId],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, fresh);
    loadedFor.current = fresh;
    setItems([]);
    setSessionId(fresh);
  }, []);

  return { items, running, loadingHistory, sessionId, send, stop, reset };
}
