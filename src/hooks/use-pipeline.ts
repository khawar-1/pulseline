"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSnapshot, type Snapshot } from "@/lib/snapshot";
import { hasSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

export type LiveStatus = "connecting" | "live" | "offline";

const TABLES = ["leads", "followups", "stage_events", "campaigns"] as const;

/**
 * Keeps the panel in step with the database while the agent works.
 *
 * Realtime is used as a *notification*, not as a data source: any change on
 * the tables the agent (or the account manager, via /api/campaigns) writes to
 * triggers a debounced refetch of the whole snapshot rather than a local
 * patch from the change payload. The
 * working set is a few dozen rows, so a refetch costs one round trip and
 * cannot drift out of sync with Postgres — whereas applying deltas by hand
 * has to get every ordering, view-recompute and missed-event case right. The
 * KPI view is derived, so it has to be re-read anyway; once you are re-reading
 * that, re-reading the rest is free.
 */
export function usePipeline(initial: Snapshot) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [status, setStatus] = useState<LiveStatus>(() =>
    hasSupabaseEnv() ? "connecting" : "offline",
  );
  const [lastChangeAt, setLastChangeAt] = useState<number | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setSnapshot(await fetchSnapshot(supabaseBrowser()));
    } catch (error) {
      console.error("[pipeline] refresh failed:", error);
    } finally {
      inFlight.current = false;
    }
  }, []);

  /** Coalesce the burst of writes a single tool call produces into one read. */
  const scheduleRefresh = useCallback(() => {
    setLastChangeAt(Date.now());
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), 200);
  }, [refresh]);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;

    const db = supabaseBrowser();
    const channel = db.channel("pulseline-pipeline");

    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }

    channel.subscribe((state) => {
      if (state === "SUBSCRIBED") setStatus("live");
      else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") setStatus("offline");
      else if (state === "CLOSED") setStatus("connecting");
    });

    const pending = timer;
    return () => {
      if (pending.current) clearTimeout(pending.current);
      void db.removeChannel(channel);
    };
  }, [scheduleRefresh]);

  return { snapshot, status, lastChangeAt, refresh };
}
