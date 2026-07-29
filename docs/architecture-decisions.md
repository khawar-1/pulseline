# Architecture decisions — live automation

Short-form record of the non-obvious calls made while wiring the Google Form
-> WhatsApp -> reply loop, and why. Written so the reasoning survives being
asked about in an interview, not just the code.

## 1. One agent, two entry points

`runAgentTurn` (`src/agent/run-turn.ts`) is the entire implementation shared by
the human chat route and both webhook routes. A webhook does not call a
different, lighter-weight path — it constructs a system-authored instruction
string (`src/agent/automation.ts`) and runs it through the exact same tools,
the same two subagents, and the same three-layer compliance gate a
human-typed message goes through. The only thing that differs between a
human-triggered turn and a webhook-triggered one is who supplied the
instruction text. This was the central design constraint going in and
everything else follows from it.

**Alternative considered:** a separate, simpler "send this message" function
for the webhook path. Rejected — it would mean the compliance gate is
provably enforced on the demo path in the console but not on the path that
actually reaches a real phone, which defeats the point of having the gate.

## 2. Full autonomy, not human-in-the-loop

Both the first outreach and every reply-triggered follow-up dispatch without
a human clicking approve. The compliance gate (schema-required verdict,
isolated-context reviewer subagent, deterministic linter) is what's load
-bearing, not a person watching the queue. This was a deliberate product
choice, made explicitly rather than defaulted into, because the alternative
(hold every draft for approval) would mean the "live demo" is still a human
sending messages by hand with extra steps.

## 3. Twilio WhatsApp Sandbox, not the Business API

Full WhatsApp Business API access requires Meta business verification and
template approval — a multi-day-to-multi-week process, not something
achievable before a demo. The Sandbox sends and receives genuinely real
WhatsApp messages over Twilio's infrastructure; the only difference is a
one-time opt-in per phone number instead of a business-verified sender, and a
single shared number for the whole app instead of one per practice. Stated
plainly in the demo narration as a scope call, not hidden. See
`docs/twilio-sandbox-setup.md`.

**Consequence:** because there is one shared sending number for every
campaign, an inbound WhatsApp message carries no campaign-identifying signal
of its own — see decision 5.

## 4. Idempotency: one mechanism, both webhooks

`webhook_events` has a unique index on `(source, dedup_key)`. Both routes
insert; a unique-violation (Postgres `23505`) means "already seen," and the
existing row is returned instead of re-running the agent. `dedup_key` is the
Google Form response id for forms, Twilio's `MessageSid` for replies. Chosen
over a bespoke per-route check-then-insert because Apps Script and Twilio
both retry aggressively on anything but a clean 2xx, and a single Postgres
unique constraint is race-safe in a way an application-level check never is.

## 5. Campaign attribution for replies — heuristic, with a stated limit

`findLeadForInboundReply` (`src/app/api/webhooks/twilio/route.ts`) resolves a
reply to a lead by phone number, in three tiers: unambiguous single match;
disambiguate toward `LIVE_DEMO_CAMPAIGN_ID` when the same phone spans
multiple campaigns; then fall back to "most recently sent an outbound
WhatsApp," then "most recently created."

**What this cannot do, and why nothing here can fix it:** a message from a
phone number with *no* existing lead at all is unattributable to any
campaign. There is no campaign field on an inbound WhatsApp message, and per
decision 3 there is exactly one shared Sandbox number for every campaign in
the app — so there is no signal anywhere to recover from. This is a Sandbox
architecture limit, not a matching-logic gap; solving it for real requires
per-campaign senders (the full Business API), which is the same scope
boundary already drawn in decision 3. State this plainly if asked rather than
implying the heuristic covers it — it only covers the case where a lead
already exists.

## 6. Static campaign facts are data, not model knowledge

`campaigns.hours` and `campaigns.booking_url`, read through a dedicated
`get_campaign_info` tool (`src/agent/tools/campaign-info.ts`), separate from
`get_campaign_kpis`. A patient asking "are you open Saturdays" or wanting a
booking link needs a real fact or a real URL, not a plausible-sounding
guess — the system prompt tells the agent to say "I don't have that on file"
when the field is null rather than inventing an answer. Kept as a separate
tool from the KPI reader on purpose: one answers "how is this campaign
performing" (spend, conversion, cost per booking — an account-manager
question), the other answers "what does the front desk say" (a
patient-facing question). Merging them risks a patient-facing draft
accidentally reasoning over spend numbers.

## 7. Repeat submitters: one card, appended to — not duplicated

When a form submission's phone number matches an existing lead in the *same*
campaign, the forms webhook does not create a second lead. It:

1. Overwrites that lead's `raw_payload` with the new submission (so
   `ingest_lead`'s re-parse reflects the fresh reason-for-visit, insurance,
   etc.), and reuses the lead's `agent_session_id` so the whole relationship
   stays one transcript.
2. If the lead was already at `contacted` or later (including `lost`),
   resets its stage back to `contacted` via `moveStage` — a real, audited
   transition — so the pipeline treats this as an active conversation again
   rather than silently sitting at a stale terminal stage.
3. Sends the agent a distinct instruction
   (`buildReturningLeadMessage`) explicitly naming the existing `lead_id` and
   telling it to call `ingest_lead` with that id, not `campaign_id` +
   `raw_payload` — the one thing that would actually create a duplicate.

**Why reset to `contacted` instead of leaving the stage alone:** `moveStage`
treats a same-stage call as a no-op and does not write a `stage_events` row
for it (existing, deliberate behavior — a no-op move is not meaningful
audit history). If a previously-`booked` lead came back and booked again
without a reset first, the second `log_kpi_event('booked')` would also be a
no-op and the second booking would leave no trace. Resetting first means the
second booking is a genuine `contacted -> booked` transition and gets its
own row, which is what makes decision 8 possible with zero new schema.

**Scope not covered:** dedup is scoped to `(campaign_id, phone)`. The same
person messaging in through two different campaigns still produces two
separate lead rows — deliberately unmerged, since a phone number spanning
campaigns has no reliable identity signal beyond the number itself, and
guessing wrong (merging two different people, or two genuinely distinct
inquiries into different practices) is worse than the duplication.

## 8. "Booked N times" reuses `stage_events` — no new table

Every `booked` transition a lead has ever reached is already a row in
`stage_events` (`to_stage = 'booked'`, with a timestamp) — that table existed
for KPI/audit purposes before any of this work. Rather than adding a new
table to track repeat bookings, the pipeline pane filters the existing
`stage_events` feed per lead and renders every `booked` date on the same
card once there is more than one. This only works because of decision 7's
stage reset — without it, a second booking is invisible to `stage_events`
too.

## 9. "Booked" is inferred from conversation, not verified against a calendar

`log_kpi_event(to_stage='booked')` is a tool call the agent makes at its own
judgment when a reply reads like a confirmed booking. There is no calendar or
scheduling-system integration checking this against a real reserved slot.
This is an honest gap, not an oversight — building real scheduling
integration is out of scope for a weekend build, the same category of call
as decisions 2 and 3. Worth stating directly if asked: "booked" here means
"the model judged this conversation as a confirmed booking," not
"a slot was reserved in a calendar."

## 10. This demo runs without a live Twilio send

The Twilio account used for this build could not complete phone
verification during setup (OTP undeliverable by both SMS and voice call to
the number used, then an unrelated verification error) — an account-access
problem, not a code problem. Rather than block the demo on a third-party
support ticket, the recording shows the pipeline through the point Twilio
enters it: a real Google Form submission drives the agent live (parse,
score, compliance review), and the compliant draft lands on the lead's card
exactly as it would before being sent — `draft_followup` writes the
`followups` row and dispatches to Twilio in the same call regardless of
whether Twilio is reachable, so this is not a reduced code path, only a
reduced *observable* one.

The send integration itself (`src/lib/twilio.ts`, the dispatch block in
`src/agent/tools/draft-followup.ts`) is unchanged and still real: `sendWhatsApp`
is exercised by `npm run verify` check 8 (confirms it degrades to `skipped`
cleanly with no Twilio configured, never throws), and `dispatch_status` on
every whatsapp `followups` row honestly reflects what actually happened
(`sent` / `failed` / `skipped`) rather than the UI ever claiming a send that
didn't occur — see the `outboundVerb` helper in `src/components/lead-row.tsx`.
State this plainly if asked: the last-mile API call is implemented and
tested, gated behind an account we couldn't get verified in time, not behind
unfinished code.

## 11. Leads never disappear from the dashboard

There is no post-visit archival, no `'visited'`/`'completed'` stage, and
nothing deletes or hides a lead once it reaches a terminal stage. This is
deliberate: the product's whole thesis is that every claim the agent makes is
checkable against the database (`README.md` / `CLAUDE.md`). A lead vanishing
after booking would undercut that — there would be no way to audit what
happened to it. If the dashboard ever needs to stay scannable at a much
larger scale, the right lever is a UI filter/collapse on old terminal-stage
leads, not deleting rows.
