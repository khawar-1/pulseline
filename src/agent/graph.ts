import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent } from "deepagents";

import { buildKnowledgeFiles } from "./knowledge";
import { SYSTEM_PROMPT } from "./prompts";
import { pulselineSubagents } from "./subagents";
import { pulselineTools } from "./tools";

/**
 * The Pulseline harness.
 *
 * `createDeepAgent` returns a compiled LangGraph graph with three middlewares
 * already wired in, which is why this file is short:
 *
 *   - planning     -> write_todos, so multi-lead work is planned before it runs
 *   - filesystem   -> ls / read_file / write_file / edit_file over a virtual FS,
 *                     which is where the domain knowledge lives
 *   - subagents    -> the task tool, for delegating to compliance-reviewer and
 *                     campaign-analyst with isolated context
 *
 * Writing those by hand as router and persistence nodes would be more code for
 * strictly less capability.
 */

/** DeepSeek exposes an OpenAI-shaped API, so the OpenAI client drives it. */
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

/**
 * `deepseek-chat` rather than `deepseek-reasoner`: the reasoner does not
 * support function calling, and every step of this agent's work is a tool call.
 */
const MODEL = process.env.PULSELINE_MODEL ?? "deepseek-chat";

function buildModel() {
  return new ChatOpenAI({
    model: MODEL,
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
    // DeepSeek implements /chat/completions only. Without this the client can
    // route to OpenAI's Responses API, which returns 404 against this host.
    useResponsesApi: false,
    // Scoring and compliance review should not vary run to run. A lead that
    // scores 78 today scoring 61 tomorrow is a bug the account manager cannot
    // see, and a compliance reviewer that is creative is a liability.
    temperature: 0,
    // deepseek-chat caps output at 8192 and defaults to 4096, which truncates
    // longer tool-call sequences mid-argument.
    maxTokens: 8000,
  });
}

export function createPulselineAgent() {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error(
      "Missing DEEPSEEK_API_KEY. Copy .env.example to .env.local and add your key.",
    );
  }

  return createDeepAgent({
    model: buildModel(),
    tools: pulselineTools,
    systemPrompt: SYSTEM_PROMPT,
    subagents: pulselineSubagents,
    name: "pulseline",
  });
}

/**
 * Initial graph state for a turn.
 *
 * The knowledge base is mounted into `files` on every invocation. The virtual
 * filesystem is state-backed rather than disk-backed, so it does not survive
 * between requests — and since conversation history is replayed from Supabase
 * rather than held in a checkpointer, remounting is what keeps the agent's
 * playbooks readable on turn two.
 */
export function initialState(messages: Array<{ role: string; content: string }>) {
  return {
    messages,
    files: buildKnowledgeFiles(),
  };
}

/** Exported for `langgraph.json` so the same graph opens in LangGraph Studio. */
export const graph = createPulselineAgent;
