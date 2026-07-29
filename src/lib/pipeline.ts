import type { Lead, Stage } from "@/lib/supabase/types";

/**
 * The presentation vocabulary for the pipeline.
 *
 * Tones are semantic, not decorative — this is the single place that decides
 * what a stage *means* visually, and every component reads it from here so a
 * lead cannot be crimson in one pane and amber in another. Crimson is reserved
 * for "stopped": lost leads and compliance violations, nothing else.
 */
export type Tone = "slate" | "ink" | "amber" | "pine" | "crimson";

/** Literal hexes for SVG and canvas, which cannot use Tailwind classes. */
export const TONE_HEX: Record<Tone, string> = {
  slate: "#6B7785",
  ink: "#0C1116",
  amber: "#C88A04",
  pine: "#124E4A",
  crimson: "#A81237",
};

export const TONE_CLASS: Record<Tone, { text: string; bg: string; dot: string }> = {
  slate: { text: "text-slate", bg: "bg-slate-tint", dot: "bg-slate" },
  ink: { text: "text-ink", bg: "bg-slate-tint", dot: "bg-ink" },
  amber: { text: "text-amber", bg: "bg-amber-tint", dot: "bg-amber" },
  pine: { text: "text-pine", bg: "bg-pine-tint", dot: "bg-pine" },
  crimson: { text: "text-crimson", bg: "bg-crimson-tint", dot: "bg-crimson" },
};

interface StageMeta {
  label: string;
  tone: Tone;
  /** What an account manager should do with leads sitting here. */
  hint: string;
}

/** Rendered top to bottom in this order — the account manager's work queue. */
export const STAGE_ORDER: Stage[] = [
  "new",
  "scored",
  "contacted",
  "responded",
  "booked",
  "lost",
];

export const STAGE_META: Record<Stage, StageMeta> = {
  new: { label: "New", tone: "slate", hint: "Unparsed. Nothing has looked at these yet." },
  scored: { label: "Scored", tone: "ink", hint: "Ranked and waiting on outreach." },
  contacted: { label: "Contacted", tone: "amber", hint: "A compliant message has gone out." },
  responded: { label: "Responded", tone: "amber", hint: "The patient replied. Close them." },
  booked: { label: "Booked", tone: "pine", hint: "An appointment exists. This is the number that pays." },
  lost: { label: "Lost", tone: "crimson", hint: "Closed out. Kept so cost-per-booking stays honest." },
};

/**
 * Score bands. A score is a work-ordering signal, so the bands answer "does
 * this deserve my next hour", not "is this a good person".
 */
export function scoreTone(score: number | null): Tone {
  if (score === null) return "slate";
  if (score >= 70) return "pine";
  if (score >= 40) return "amber";
  return "slate";
}

export function scoreLabel(score: number | null): string {
  if (score === null) return "Unscored";
  if (score >= 70) return "Strong";
  if (score >= 40) return "Worth working";
  return "Weak";
}

export function leadName(lead: Lead): string {
  const parsed = lead.parsed?.full_name?.trim();
  if (parsed) return parsed;

  // Unparsed leads still have to be nameable — the raw ad-form payload is what
  // the agent is about to work from, so show whatever it actually contains.
  const raw = lead.raw_payload as Record<string, unknown>;
  const fields = raw?.field_data;
  if (Array.isArray(fields)) {
    for (const field of fields) {
      const f = field as { name?: string; values?: unknown[] };
      if (/name/i.test(f?.name ?? "") && typeof f?.values?.[0] === "string") {
        return f.values[0] as string;
      }
    }
  }
  for (const key of ["full_name", "name", "first_name"]) {
    if (typeof raw?.[key] === "string") return raw[key] as string;
  }
  return "Unnamed lead";
}

/** Short form of a uuid, for the mono column. Enough to match against a log. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(1)}%`;
}

/**
 * Compact relative time. Timestamps in a dense list must not wrap.
 *
 * `now` is passed in rather than read from `Date.now()` because this renders on
 * the server and again during hydration, and the gap between the two is enough
 * to tip "41m ago" to "42m ago" and fail the match. Callers pass
 * `snapshot.fetchedAt`, so the whole pane is relative to one instant — which is
 * also more honest: nothing here ticks, these are ages as of the last read.
 */
export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const PRACTICE_LABEL: Record<string, string> = {
  dermatology: "Dermatology",
  pediatrics: "Pediatrics",
  cardiology: "Cardiology",
};

export const AD_SOURCE_LABEL: Record<string, string> = {
  google_search: "Google Search",
  meta_feed: "Meta Feed",
  direct_form: "Direct Form",
};

/** Short absolute date for a list of repeat events, e.g. multiple bookings on one lead. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
