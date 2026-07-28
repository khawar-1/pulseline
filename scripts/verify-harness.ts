/**
 * Phase 1 end-to-end verification.
 *
 *   npm run verify
 *
 * Exercises the whole data layer and harness headlessly, before any UI exists.
 * Checks 1-6 call the tools directly and assert against Supabase; check 7 runs
 * the full Deep Agent and asserts that the planning and subagent-delegation
 * middleware actually fired — that is the difference between a Deep Agent and a
 * chatbot with tools, and it should be proven rather than assumed.
 *
 * Every check reports what it saw, so a failure says what went wrong rather
 * than just that something did.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createPulselineAgent, initialState } from "../src/agent/graph";
import {
  draftFollowup,
  ingestLead,
  logKpiEvent,
  queryLeads,
  scoreLead,
} from "../src/agent/tools";
import { supabaseAdmin } from "../src/lib/supabase/server";
import { STAGE_RANK, type Lead, type Stage } from "../src/lib/supabase/types";

// ---------------------------------------------------------------------------
// Tiny check runner
// ---------------------------------------------------------------------------

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];

async function check(name: string, fn: () => Promise<string>): Promise<boolean> {
  process.stdout.write(`  ${name} ... `);
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`PASS\n      ${detail}`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`FAIL\n      ${detail}`);
    return false;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Tools return compact JSON strings. */
async function callTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: { invoke: (input: any) => Promise<unknown> },
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const raw = await tool.invoke(args);
  return JSON.parse(String(raw)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------

const db = supabaseAdmin();

/** Picked in check 1 and reused by the rest, so the checks read as one session. */
let workLeadId = "";
let workCampaignId = "";

async function main() {
  console.log("\nPulseline harness verification\n" + "=".repeat(60) + "\n");

  // -- 1 -------------------------------------------------------------------
  await check("1. Schema applied and seed data present", async () => {
    const { data: campaigns, error: cErr } = await db.from("campaigns").select("*");
    assert(!cErr, `campaigns query failed: ${cErr?.message}`);
    assert(campaigns && campaigns.length === 3, `expected 3 campaigns, got ${campaigns?.length ?? 0}`);

    const { data: leads, error: lErr } = await db.from("leads").select("*");
    assert(!lErr, `leads query failed: ${lErr?.message}`);
    assert(leads && leads.length >= 18, `expected >=18 leads, got ${leads?.length ?? 0}`);

    const unworked = (leads as Lead[]).filter((l) => l.stage === "new" && l.parsed === null);
    assert(unworked.length > 0, "no unworked leads — the agent would have nothing to do in the demo");

    workLeadId = unworked[0].id;
    workCampaignId = unworked[0].campaign_id;

    const { error: vErr } = await db.from("campaign_kpis").select("*").limit(1);
    assert(!vErr, `campaign_kpis view missing or broken: ${vErr?.message}`);

    return `${campaigns!.length} campaigns, ${leads!.length} leads (${unworked.length} unworked), KPI view live`;
  });

  // -- 2 -------------------------------------------------------------------
  await check("2. ingest_lead parses a raw ad-form payload", async () => {
    const out = await callTool(ingestLead, { lead_id: workLeadId });
    assert(out.ok, `tool returned an error: ${out.error}`);

    const { data } = await db.from("leads").select("parsed").eq("id", workLeadId).single();
    const parsed = (data as { parsed: Record<string, unknown> | null }).parsed;
    assert(parsed, "parsed column is still null after ingest");
    assert(parsed!.full_name, "parser did not extract a name out of field_data");
    assert(parsed!.reason, "parser did not extract the reason for visit");
    assert(parsed!.contact_completeness, "contact_completeness was not derived");

    return `parsed "${parsed!.full_name}" — contact: ${parsed!.contact_completeness}`;
  });

  // -- 3 -------------------------------------------------------------------
  await check("3. score_lead persists a score, reasoning, and stage move", async () => {
    const out = await callTool(scoreLead, {
      lead_id: workLeadId,
      score: 82,
      reasoning:
        "Verification fixture: complete contact details and a clear stated reason for visit, with in-network insurance named.",
      playbook_signals: ["in-network insurance named", "complete contact details"],
      intent: "medical",
    });
    assert(out.ok, `tool returned an error: ${out.error}`);

    const { data } = await db
      .from("leads")
      .select("score, score_reasoning, stage")
      .eq("id", workLeadId)
      .single();
    const lead = data as Pick<Lead, "score" | "score_reasoning" | "stage">;

    assert(lead.score !== null && lead.score >= 0 && lead.score <= 100, `score out of range: ${lead.score}`);
    assert(lead.score_reasoning && lead.score_reasoning.length > 20, "reasoning missing or too short");
    assert(lead.stage === "scored", `expected stage 'scored', got '${lead.stage}'`);

    const { data: events } = await db.from("stage_events").select("*").eq("lead_id", workLeadId);
    assert(events && events.length > 0, "stage move was not written to stage_events");

    return `score ${lead.score}, stage -> ${lead.stage}, ${events!.length} stage event(s) logged`;
  });

  // -- 4 -------------------------------------------------------------------
  await check("4. draft_followup persists a message with a compliance verdict", async () => {
    const out = await callTool(draftFollowup, {
      lead_id: workLeadId,
      channel: "sms",
      content:
        "Hi, this is Lakeshore Dermatology following up on your request for an appointment. " +
        "We have morning openings this week and we are in network with your plan. " +
        "Would Tuesday or Wednesday morning work? Reply STOP to opt out.",
      compliance_verdict: "pass",
      compliance_notes:
        "Checked Rules 1-5. No clinical characterisation, no coverage prediction, no manufactured urgency, opt-out present.",
    });
    assert(out.ok, `tool refused a compliant message: ${out.error}`);

    const { data } = await db
      .from("followups")
      .select("*")
      .eq("lead_id", workLeadId)
      .order("sent_at", { ascending: false })
      .limit(1);
    assert(data && data.length === 1, "no followup row was written");
    const followup = data![0] as { compliance_verdict: string | null; compliance_notes: string | null };
    assert(followup.compliance_verdict, "followup was written with no compliance verdict");
    assert(followup.compliance_notes, "followup was written with no compliance notes");

    const { data: leadRow } = await db.from("leads").select("stage").eq("id", workLeadId).single();
    assert((leadRow as { stage: Stage }).stage === "contacted", "lead did not advance to 'contacted'");

    return `followup saved, verdict='${followup.compliance_verdict}', lead -> contacted`;
  });

  // -- 5 -------------------------------------------------------------------
  // The one that matters: a message that breaks the rules must not reach the
  // database, even though the caller claims it passed review.
  await check("5. ADVERSARIAL — violating message is refused and not persisted", async () => {
    const { count: before } = await db
      .from("followups")
      .select("*", { count: "exact", head: true })
      .eq("lead_id", workLeadId);

    const out = await callTool(draftFollowup, {
      lead_id: workLeadId,
      channel: "sms",
      content:
        "Hi! Don't worry, that sounds like mild eczema and our dermatologists can clear that up. " +
        "Your insurance will be covered in full. Only 2 slots left this week, don't wait!",
      // Deliberately claims a clean review — the linter must not take its word for it.
      compliance_verdict: "pass",
      compliance_notes: "Fixture claiming a clean review for a message that is not clean.",
    });

    assert(out.ok === false, "a violating message was ACCEPTED — the compliance gate is not holding");
    assert(out.written === false, "tool reported failure but claims it wrote the row");

    const violations = out.violations as Array<{ rule: string; matched: string }> | undefined;
    assert(violations && violations.length >= 4, `expected >=4 violations, got ${violations?.length ?? 0}`);

    const rules = new Set(violations!.map((v) => v.rule));
    assert([...rules].some((r) => r.includes("Rule 1")), "failed to catch the clinical advice / reassurance");
    assert([...rules].some((r) => r.includes("Rule 3")), "failed to catch the coverage promise");
    assert([...rules].some((r) => r.includes("Rule 4")), "failed to catch the manufactured urgency");

    const { count: after } = await db
      .from("followups")
      .select("*", { count: "exact", head: true })
      .eq("lead_id", workLeadId);
    assert(before === after, `a row was written despite refusal (${before} -> ${after})`);

    return `refused with ${violations!.length} violations across ${rules.size} rules; nothing written`;
  });

  // -- 6 -------------------------------------------------------------------
  await check("6. log_kpi_event writes an event and KPIs recompute correctly", async () => {
    const out = await callTool(logKpiEvent, {
      lead_id: workLeadId,
      to_stage: "booked",
      note: "Verification fixture.",
    });
    assert(out.ok, `tool returned an error: ${out.error}`);

    const stageChange = out.stage_change as { to: string; logged: boolean };
    assert(stageChange.logged, "stage change was not logged");
    assert(stageChange.to === "booked", `expected move to 'booked', got '${stageChange.to}'`);

    // Recompute the campaign's KPIs by hand and compare against the view, so a
    // silent drift in the SQL shows up here rather than in the demo.
    const { data: leads } = await db
      .from("leads")
      .select("stage")
      .eq("campaign_id", workCampaignId);
    const { data: campaign } = await db
      .from("campaigns")
      .select("spend")
      .eq("id", workCampaignId)
      .single();

    const rows = (leads ?? []) as Array<{ stage: Stage }>;
    const spend = Number((campaign as { spend: number }).spend);
    const total = rows.length;
    const booked = rows.filter((r) => r.stage === "booked").length;
    const responded = rows.filter((r) => STAGE_RANK[r.stage] >= STAGE_RANK.responded).length;

    const expectedCpl = Math.round((spend / total) * 100) / 100;
    const expectedBookedRate = Math.round((1000 * booked) / total) / 10;
    const expectedConversion = Math.round((1000 * responded) / total) / 10;

    const kpis = out.campaign_kpis as Record<string, number>;
    assert(
      Math.abs(Number(kpis.cost_per_lead) - expectedCpl) < 0.02,
      `cost_per_lead mismatch: view=${kpis.cost_per_lead} expected=${expectedCpl}`,
    );
    assert(
      Math.abs(Number(kpis.booked_visit_rate_pct) - expectedBookedRate) < 0.15,
      `booked_visit_rate mismatch: view=${kpis.booked_visit_rate_pct} expected=${expectedBookedRate}`,
    );
    assert(
      Math.abs(Number(kpis.conversion_rate_pct) - expectedConversion) < 0.15,
      `conversion_rate mismatch: view=${kpis.conversion_rate_pct} expected=${expectedConversion}`,
    );

    return `CPL $${kpis.cost_per_lead}, booked ${kpis.booked_visit_rate_pct}%, conversion ${kpis.conversion_rate_pct}% — all match hand-calculation`;
  });

  // -- 7 -------------------------------------------------------------------
  await check("7. Deep Agent runs end-to-end with planning and delegation", async () => {
    const agent = createPulselineAgent();

    const result = (await agent.invoke(
      initialState([
        {
          role: "user",
          content:
            "Work the Brightpath Pediatrics backlog. Parse and score every lead that is " +
            "still unworked, then draft outreach for the strongest one and get it through " +
            "compliance review before saving it. Tell me what you did.",
        },
      ]),
      { recursionLimit: 60 },
    )) as { messages: Array<{ tool_calls?: Array<{ name: string }> }> };

    const toolsUsed = new Set<string>();
    for (const message of result.messages ?? []) {
      for (const call of message.tool_calls ?? []) toolsUsed.add(call.name);
    }

    assert(toolsUsed.size > 0, "the agent completed without calling a single tool");
    assert(toolsUsed.has("write_todos"), "planning middleware never fired — no write_todos call");
    assert(toolsUsed.has("task"), "subagent middleware never fired — no delegation to compliance-reviewer");
    assert(
      toolsUsed.has("read_file"),
      "the agent never read a playbook — the knowledge base is not being used",
    );
    assert(toolsUsed.has("query_leads"), "the agent never queried the pipeline");
    assert(toolsUsed.has("score_lead"), "the agent never scored a lead");

    return `${result.messages.length} messages, tools used: ${[...toolsUsed].sort().join(", ")}`;
  });

  // -- summary -------------------------------------------------------------
  const passed = results.filter((r) => r.ok).length;
  console.log("\n" + "=".repeat(60));
  console.log(`${passed}/${results.length} checks passed`);
  if (passed < results.length) {
    console.log("\nFailed:");
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.detail}`);
  }
  console.log();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error("\nVerification aborted:", error);
  process.exit(1);
});
