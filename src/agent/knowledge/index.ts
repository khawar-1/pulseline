import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Domain knowledge is authored as markdown and mounted into the Deep Agent's
 * virtual filesystem rather than pasted into the system prompt.
 *
 * Two reasons this matters:
 *
 *  1. Context economy. Three practice playbooks plus the compliance rules run
 *     to several thousand tokens. Inlining all of it on every turn would crowd
 *     out the conversation. Mounted as files, the agent reads only the playbook
 *     for the practice it is actually working.
 *
 *  2. Subagent isolation. The compliance-reviewer gets the same file mount, so
 *     it reviews against the same written rules the main agent drafts against,
 *     with no risk of the two drifting apart.
 */

/** Matches deepagents' FileDataV2. */
export interface KnowledgeFile {
  content: string;
  mimeType: string;
  created_at: string;
  modified_at: string;
}

export type FilesRecord = Record<string, KnowledgeFile>;

const KNOWLEDGE_DIR = join(process.cwd(), "src", "agent", "knowledge");

const DOCUMENTS = [
  "compliance.md",
  "dermatology.md",
  "pediatrics.md",
  "cardiology.md",
] as const;

export type PracticeType = "dermatology" | "pediatrics" | "cardiology";

/** VFS path for a practice's playbook, e.g. "dermatology" -> "/knowledge/dermatology.md". */
export function playbookPath(practiceType: PracticeType): string {
  return `/knowledge/${practiceType}.md`;
}

export const COMPLIANCE_PATH = "/knowledge/compliance.md";

let cached: FilesRecord | null = null;

/**
 * Read the knowledge base off disk and return it as a deepagents `files`
 * record, keyed by VFS path. Cached after the first call — the files are
 * static, and on a warm serverless instance this avoids re-reading them on
 * every request.
 */
export function buildKnowledgeFiles(): FilesRecord {
  if (cached) return cached;

  const now = new Date().toISOString();
  const files: FilesRecord = {};

  for (const name of DOCUMENTS) {
    files[`/knowledge/${name}`] = {
      content: readFileSync(join(KNOWLEDGE_DIR, name), "utf8"),
      mimeType: "text/markdown",
      created_at: now,
      modified_at: now,
    };
  }

  cached = files;
  return files;
}
