"use client";

import { useState } from "react";

import { AD_SOURCE_LABEL, PRACTICE_LABEL } from "@/lib/pipeline";
import { AD_SOURCES, PRACTICE_TYPES, type AdSource, type PracticeType } from "@/lib/supabase/types";

/**
 * Campaign creation, for the account manager.
 *
 * Every other write in this app is the agent calling a tool. A new campaign
 * is a human decision, so it's the one thing with a plain form instead of a
 * chat instruction -- POSTs to /api/campaigns, which is the only other place
 * (besides the agent's own tools) allowed to write through the service-role
 * client. Realtime on the campaigns table (see use-pipeline.ts) is what
 * makes the new chip show up without a manual refresh.
 */
export function NewCampaignDialog({ onCreated }: { onCreated?: (campaignId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set right after a successful create — shows the "wire it to a form" step instead of just closing. */
  const [created, setCreated] = useState<{ id: string; practiceName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [practiceName, setPracticeName] = useState("");
  const [practiceType, setPracticeType] = useState<PracticeType>("dermatology");
  const [adSource, setAdSource] = useState<AdSource>("direct_form");
  const [spend, setSpend] = useState("0");
  const [hours, setHours] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");

  const reset = () => {
    setPracticeName("");
    setPracticeType("dermatology");
    setAdSource("direct_form");
    setSpend("0");
    setHours("");
    setBookingUrl("");
    setError(null);
  };

  const submit = async () => {
    if (!practiceName.trim()) {
      setError("Practice name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practice_name: practiceName.trim(),
          practice_type: practiceType,
          ad_source: adSource,
          spend: Number(spend) || 0,
          hours: hours.trim() || undefined,
          booking_url: bookingUrl.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create campaign.");
        return;
      }
      onCreated?.(json.campaign.id);
      setCreated({ id: json.campaign.id, practiceName: json.campaign.practice_name });
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setOpen(false);
    setCreated(null);
    setCopied(false);
    reset();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full border border-dashed border-line px-3.5 py-2 text-left text-[0.8125rem] font-semibold text-slate transition-all duration-200 hover:border-pine/40 hover:bg-pine-tint/40 hover:text-pine"
      >
        + New campaign
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-sm px-4 py-8">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-paper p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[0.9375rem] font-semibold text-ink">
                {created ? "Campaign created" : "New campaign"}
              </h3>
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-2 py-1 text-slate/60 hover:bg-slate-tint/60 hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {created ? (
              <CreatedPanel
                practiceName={created.practiceName}
                copied={copied}
                onCopy={() => {
                  void navigator.clipboard.writeText(created.practiceName).then(() => {
                    setCopied(true);
                  });
                }}
                onDone={close}
              />
            ) : (
            <>
            <div className="space-y-3">
              <Field label="Practice name">
                <input
                  value={practiceName}
                  onChange={(e) => setPracticeName(e.target.value)}
                  placeholder="e.g. Riverside Family Dermatology"
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-pine/50"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Specialty">
                  <select
                    value={practiceType}
                    onChange={(e) => setPracticeType(e.target.value as PracticeType)}
                    className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-pine/50"
                  >
                    {PRACTICE_TYPES.map((t) => (
                      <option key={t} value={t}>{PRACTICE_LABEL[t] ?? t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Lead source">
                  <select
                    value={adSource}
                    onChange={(e) => setAdSource(e.target.value as AdSource)}
                    className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-pine/50"
                  >
                    {AD_SOURCES.map((s) => (
                      <option key={s} value={s}>{AD_SOURCE_LABEL[s] ?? s}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Ad spend to date ($, optional)">
                <input
                  type="number"
                  min="0"
                  value={spend}
                  onChange={(e) => setSpend(e.target.value)}
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-pine/50"
                />
              </Field>

              <Field label="Office hours (optional — the agent reads this to answer patients)">
                <input
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="Mon-Fri 9am-5pm"
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-pine/50"
                />
              </Field>

              <Field label="Booking link (optional)">
                <input
                  value={bookingUrl}
                  onChange={(e) => setBookingUrl(e.target.value)}
                  placeholder="https://book.example.com/new-patient"
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-pine/50"
                />
              </Field>

              {error && (
                <p className="rounded-lg border border-crimson/25 bg-crimson-tint/40 px-3 py-2 text-[0.8rem] text-crimson">
                  {error}
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-slate hover:bg-slate-tint/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="rounded-lg bg-pine-gradient px-3.5 py-2 text-sm font-semibold text-white shadow-[0_2px_12px_rgba(18,78,74,0.38)] disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create campaign"}
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CreatedPanel({
  practiceName,
  copied,
  onCopy,
  onDone,
}: {
  practiceName: string;
  copied: boolean;
  onCopy: () => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-3.5">
      <p className="text-[0.8125rem] leading-relaxed text-ink/80">
        <span className="font-semibold text-pine">{practiceName}</span> is live in the
        pipeline. To connect a real Google Form to it, set the Apps Script&apos;s{" "}
        <code className="rounded bg-slate-tint px-1 py-0.5 font-mono text-[0.75rem]">CAMPAIGN_NAME</code>{" "}
        to the exact name below — no id to look up anywhere.
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2">
        <code className="flex-1 truncate font-mono text-[0.8125rem] text-ink">{practiceName}</code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-md border border-line px-2 py-1 text-[0.7rem] font-medium text-slate hover:bg-slate-tint/60"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[0.75rem] leading-relaxed text-slate/70">
        See <code className="font-mono">docs/apps-script/README.md</code> for the full
        one-time setup (paste the script, set the shared secret, wire the trigger).
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-pine-gradient px-3.5 py-2 text-sm font-semibold text-white shadow-[0_2px_12px_rgba(18,78,74,0.38)]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.7rem] font-medium text-slate/70">{label}</span>
      {children}
    </label>
  );
}
