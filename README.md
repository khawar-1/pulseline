# Pulseline

A lead-to-booking copilot for healthcare marketing account managers.

Inbound patient enquiries arrive from Google and Meta ad campaigns and sit in a
pipeline until someone works them. Pulseline works them: it parses the raw form
submissions, scores each lead's booking likelihood against a practice-specific
playbook, drafts compliant follow-up messages, and reports campaign performance —
driven from a chat interface, with the pipeline updating live as the agent acts.

Built as a take-home challenge for Z360 / Zikra Infotech.

---

## Why the compliance rule is the centre of the product

A marketing agency that sends the wrong message on a practice's behalf can expose
that practice to a HIPAA complaint, a state medical board inquiry, or an FTC
deceptive-advertising claim. So the interesting engineering problem here is not
"can an LLM write a friendly follow-up" — it is "can you build a system where an
LLM *cannot* send a non-compliant one."

Pulseline enforces that in three independent layers, none of which rely on the
model choosing to cooperate:

1. **Schema.** `draft_followup` requires `compliance_verdict` and
   `compliance_notes`. There is no code path that writes a follow-up without a
   review having produced them, and the notes have a minimum length so a
   rubber-stamp does not satisfy it.
2. **A reviewer subagent.** `compliance-reviewer` runs with isolated context — it
   sees the draft and the rules, not the reasoning that produced the draft, so it
   is not invested in the draft being fine. It returns the message approved or
   rewritten.
3. **A deterministic linter.** `draft_followup` re-checks the final text itself
   against the rules that are never acceptable. If it fires, **nothing is
   written** and the violations come back for the agent to fix. This is the
   backstop for a reviewer that rubber-stamps.

Plus one hard stop: a lead whose submission describes acute symptoms is flagged at
scoring time and `draft_followup` refuses it outright. A marketing agent is the
wrong actor to answer that message, and no wording makes it right.

---

## Architecture

```
Browser ──► Next.js route handler (/api/chat, streaming SSE)
              └─► LangGraph Deep Agent (in-process)
                    ├─ built-in: write_todos, ls/read_file/write_file/edit_file, task
                    ├─ domain tools ──► Supabase (service-role, server only)
                    └─ subagents: compliance-reviewer, campaign-analyst
Browser ──► Supabase Realtime (anon key, read-only) ──► live pipeline + KPIs
```

**The harness** is the official [`deepagents`](https://github.com/langchain-ai/deepagentsjs)
package on LangGraph.js. That supplies planning (`write_todos`), a virtual
filesystem, and subagent delegation (`task`) as middleware — so `src/agent/graph.ts`
is ~40 lines and the workflow lives in tool design and subagents rather than in
hand-wired router nodes.

**Domain knowledge** is markdown mounted into the agent's virtual filesystem, not
pasted into the system prompt. The agent reads only the playbook for the specialty
it is working, and the compliance reviewer reads the same rules file the main
agent drafts against, so the two cannot drift apart.

**KPIs** are derived on read from a Postgres view over `campaigns` + `leads`, never
stored. They cannot drift out of sync with the pipeline they describe.

### Deliberate tradeoffs

- **Agent co-deployed with the frontend, not a separate service.** The top failure
  mode for a reviewed demo is opening the link and finding the agent host cold or
  asleep. Running the compiled graph in-process eliminates that entire class of
  failure. `langgraph.json` is still checked in, so the same graph opens in
  LangGraph Studio (`npm run studio`).
- **No LangGraph checkpointer.** Conversation history is replayed from a
  `chat_messages` table. A Postgres checkpointer over serverless needs pooled
  connections and careful lifecycle handling; replaying a short message list is a
  few lines and cannot half-fail.
- **No auth.** Public demo, synthetic data, RLS grants the browser read-only
  access, and every write goes through a server route holding the service-role key.
- **Realtime is a notification, not a data source.** A change on `leads`,
  `followups` or `stage_events` triggers a debounced refetch of the whole
  snapshot rather than a local patch from the change payload. The working set is
  a few dozen rows, so a refetch is one round trip and cannot drift from
  Postgres, whereas applying deltas by hand has to get every ordering and
  missed-event case right. The KPI view is derived and has to be re-read after
  any change anyway; once you are re-reading that, re-reading the rest is free.
- **`deepseek-chat` as the model, reached through its OpenAI-compatible
  endpoint.** The harness takes a LangChain chat model, so the provider is one
  constructor in `src/agent/graph.ts` and nothing downstream knows or cares.
  That is the point of the compliance design: correctness here does not rest on
  the model behaving. The schema requirement, the reviewer subagent, and the
  deterministic linter hold regardless of which model is behind them — which is
  exactly the property you want when the model is a swappable dependency.

---

## The interface

Two panes, always both visible on desktop: the **console** on the left, the
**panel** on the right. That is the load-bearing decision. An account manager
has to watch the pipeline change *while* the agent explains itself — putting
the pipeline behind a tab would turn every claim the agent makes into something
you have to go and verify.

The panes share no state beyond which campaign is selected. The console streams
from the agent endpoint; the panel reads Postgres over Supabase Realtime. They
agree because neither trusts anything but the database — so if the transcript
and the panel ever disagree, the panel is right.

**The Pulse Trace** is the signature element and it is real data, not
decoration: one ECG complex per row in `stage_events`, **amplitude set by that
lead's score**, colour set by the stage it moved into, and a downward spike when
a lead is lost. Flat line between events, so a campaign nobody is working
literally flatlines. It cannot be lifted onto another product without being
rebuilt, which was the point.

**The console narrates rather than logs.** Every tool gets a written line —
"scored 78 / 100 · Lakeshore Dermatology · capped from 84" — and two cases get
expanded treatment because they are the product: a delegation to a subagent
(with the subagent's own output and tool calls nested inside it, which is the
clearest proof the harness really splits the work) and a compliance outcome,
where a blocked message is shown struck through beside the specific rules it
broke and the note that nothing was written.

**Motion is limited to three moments** — the trace drawing itself on load, a
lead row travelling to its new stage group, and a score counting up the first
time a lead is scored. All three are suppressed under `prefers-reduced-motion`.
Focus is a solid 2px pine ring rather than a subtle glow, because the surface is
dense. Below `lg` the panes stack behind a toggle instead of being compressed —
a squeezed two-pane is worse than either pane alone.

Palette: `#0C1116` graphite, `#F2F4F6` chart, `#124E4A` pine, `#C88A04` amber,
`#A81237` crimson, `#6B7785` slate. Colour is bound to domain meaning, never
used decoratively — crimson only ever means *stopped*. Instrument Serif for the
wordmark and KPI numerals, IBM Plex Sans and Mono for everything else.

---

## Setup

Requires Node 20.9+.

```bash
npm install
cp .env.example .env.local     # then fill it in
```

**1. Supabase.** Create a project at [supabase.com](https://supabase.com), then in
the SQL editor run `supabase/schema.sql` followed by `supabase/seed.sql`. Copy the
Project URL, `anon` key, and `service_role` key from Project Settings → API into
`.env.local`.

**2. Model.** Add a `DEEPSEEK_API_KEY` from
[platform.deepseek.com](https://platform.deepseek.com/api_keys). The harness
talks to DeepSeek through its OpenAI-compatible endpoint, so pointing it at any
other OpenAI-shaped provider is a two-line change in `src/agent/graph.ts`.

**3. Verify the harness end-to-end:**

```bash
npm run verify
```

This runs headlessly against your real database and prints a pass/fail table for
seven checks — including an adversarial one that feeds `draft_followup` a message
breaking four compliance rules while *claiming* it passed review, and asserts
nothing reaches the database. The last check runs the full agent and asserts that
the planning and delegation middleware actually fired, rather than assuming it.

```bash
npm run dev        # app on :3000
npm run studio     # the same graph in LangGraph Studio
npm run typecheck
```

---

## Layout

```
supabase/schema.sql          tables, KPI view, RLS, realtime
supabase/seed.sql            3 campaigns x 7 leads, part worked / part untouched
src/agent/graph.ts           the harness
src/agent/prompts.ts         system prompt + subagent prompts
src/agent/subagents.ts       compliance-reviewer, campaign-analyst
src/agent/tools/             6 domain tools
src/agent/knowledge/*.md     practice playbooks + compliance rules (mounted to VFS)
src/lib/supabase/            service-role and anon clients, DB types
src/app/api/chat/route.ts    streaming agent endpoint
scripts/verify-harness.ts    headless end-to-end verification

src/app/page.tsx             server-rendered first snapshot
src/components/workspace.tsx the two-pane shell
src/components/console-pane  transcript, tool cards, composer
src/components/panel-pane    campaign switcher, trace, KPIs, pipeline
src/components/pulse-trace   the signature element
src/lib/console.ts           tool -> human narration
src/lib/pipeline.ts          stage/score vocabulary, shared by every component
src/hooks/use-pipeline.ts    Realtime subscription + debounced refetch
src/hooks/use-agent-chat.ts  SSE client for /api/chat
```

### The tools

| Tool | What it does |
|---|---|
| `query_leads` | Find leads by campaign, stage, score, or "needs work". The agent's entry point. |
| `ingest_lead` | Deterministically parse a raw ad-form payload into structured fields. |
| `score_lead` | Persist a 0–100 booking score with cited playbook signals. Applies two hard caps in code. |
| `draft_followup` | Persist outreach — behind the three compliance layers above. |
| `log_kpi_event` | Move a lead, write the audit event, return recomputed KPIs. |
| `get_campaign_kpis` | Read-only performance data for the analyst subagent. |

Two of these were not in the original spec and were added because the workflow
does not function without them: `query_leads` (nothing else produces a lead id, so
the agent could never answer "what should I work today?") and `get_campaign_kpis`
(the analyst needs to read performance without mutating the pipeline).

The split between `ingest_lead` and `score_lead` is deliberate: extraction from
`field_data` is mechanical and has a right answer, so it runs in code and is
identical every run; judgment needs the playbook, so it runs in the agent and the
tool records which signals it rested on.
