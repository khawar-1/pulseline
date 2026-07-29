"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { AD_SOURCE_LABEL, PRACTICE_LABEL } from "@/lib/pipeline";
import { AD_SOURCES, PRACTICE_TYPES, type AdSource, type Campaign, type PracticeType } from "@/lib/supabase/types";

/** See the matching hook in new-campaign-dialog.tsx for why this isn't useEffect + useState. */
const noopSubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Edit or delete an existing campaign.
 *
 * The one number Pulseline can never know on its own is ad spend -- there's
 * no ad-platform integration, so this is where a manager keeps that figure
 * current as the campaign runs. Everything else on the KPI cards (lead
 * counts, conversion, cost/lead, cost/booking) is derived live from real
 * pipeline activity and never needs manual input.
 *
 * Delete cascades to every lead, followup, and stage event under this
 * campaign (enforced in the schema) -- permanent, hence the type-to-confirm.
 */
export function CampaignSettingsDialog({
  campaign,
  onSaved,
  onDeleted,
}: {
  campaign: Campaign;
  onSaved?: () => void;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useMounted();

  const [practiceName, setPracticeName] = useState(campaign.practice_name);
  const [practiceType, setPracticeType] = useState<PracticeType>(campaign.practice_type);
  const [adSource, setAdSource] = useState<AdSource>(campaign.ad_source);
  const [spend, setSpend] = useState(String(campaign.spend));
  const [hours, setHours] = useState(campaign.hours ?? "");
  const [bookingUrl, setBookingUrl] = useState(campaign.booking_url ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const openFresh = () => {
    setPracticeName(campaign.practice_name);
    setPracticeType(campaign.practice_type);
    setAdSource(campaign.ad_source);
    setSpend(String(campaign.spend));
    setHours(campaign.hours ?? "");
    setBookingUrl(campaign.booking_url ?? "");
    setError(null);
    setConfirmDelete(false);
    setDeleteTyped("");
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practice_name: practiceName.trim(),
          practice_type: practiceType,
          ad_source: adSource,
          spend: Number(spend) || 0,
          hours: hours.trim() || null,
          booking_url: bookingUrl.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save changes.");
        return;
      }
      onSaved?.();
      setOpen(false);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to delete campaign.");
        return;
      }
      setOpen(false);
      onDeleted?.();
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openFresh}
        aria-label={`Manage ${campaign.practice_name}`}
        className="rounded-md p-1 text-slate/50 hover:bg-slate-tint/60 hover:text-ink"
      >
        <GearIcon />
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-ink/40 backdrop-blur-sm px-4 py-8">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-paper p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[0.9375rem] font-semibold text-ink">Manage campaign</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-slate/60 hover:bg-slate-tint/60 hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Practice name">
                <input
                  value={practiceName}
                  onChange={(e) => setPracticeName(e.target.value)}
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-pine/50"
                />
              </Field>
              <p className="text-[0.7rem] leading-relaxed text-amber">
                Renaming breaks any Google Form already pointed at this campaign by name —
                update the form&apos;s Apps Script <code className="font-mono">CAMPAIGN_NAME</code> to match if you change this.
              </p>

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

              <Field label="Ad spend to date ($) — the only figure Pulseline can't compute itself">
                <input
                  type="number"
                  min="0"
                  value={spend}
                  onChange={(e) => setSpend(e.target.value)}
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-pine/50"
                />
              </Field>

              <Field label="Office hours (optional)">
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
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-slate hover:bg-slate-tint/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !practiceName.trim()}
                className="rounded-lg bg-pine-gradient px-3.5 py-2 text-sm font-semibold text-white shadow-[0_2px_12px_rgba(26,74,60,0.38)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            {/* Danger zone */}
            <div className="mt-6 rounded-xl border border-crimson/25 bg-crimson-tint/20 p-3.5">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-[0.8125rem] font-semibold text-crimson hover:underline"
                >
                  Delete this campaign
                </button>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-[0.75rem] leading-relaxed text-crimson">
                    This permanently deletes <strong>{campaign.practice_name}</strong> and every
                    lead, message, and event under it. Type the practice name to confirm.
                  </p>
                  <input
                    value={deleteTyped}
                    onChange={(e) => setDeleteTyped(e.target.value)}
                    placeholder={campaign.practice_name}
                    className="w-full rounded-lg border border-crimson/30 bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-crimson/60"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setConfirmDelete(false); setDeleteTyped(""); }}
                      className="rounded-lg border border-line px-3 py-1.5 text-[0.8rem] font-medium text-slate hover:bg-slate-tint/60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={remove}
                      disabled={deleting || deleteTyped.trim() !== campaign.practice_name}
                      className="rounded-lg bg-crimson px-3 py-1.5 text-[0.8rem] font-semibold text-white disabled:opacity-40"
                    >
                      {deleting ? "Deleting…" : "Delete permanently"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
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

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke="currentColor" strokeWidth="1.6"
      />
      <path
        d="M19.4 13a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V19a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H4a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H10a1.65 1.65 0 001-1.51V4a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V10a1.65 1.65 0 001.51 1H20a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
      />
    </svg>
  );
}
