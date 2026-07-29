import { Fragment } from "react";

/**
 * Minimal markdown rendering for the agent's replies.
 *
 * Deliberately not a markdown library. The agent writes short operational
 * answers — paragraphs, bullets, the occasional bolded lead name, and (for
 * KPI comparisons) a small table — and a parser that only handles those
 * cannot inject anything, needs no dependency, and cannot render a heading
 * three times the size of the pane.
 */
export function AgentText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-2 space-y-1.5 pl-0.5">
        {bullets.map((item, index) => (
          <li key={index} className="flex gap-2.5">
            <span className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-pine/40" aria-hidden />
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  const lines = text.split("\n").map((l) => l.trimEnd());
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // GFM pipe table: a "| a | b |" header immediately followed by a
    // "|---|---|" separator row. Anything less exact than that isn't treated
    // as a table -- a stray pipe in a sentence must never eat the rest of
    // the message.
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      flushBullets();
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push(<AgentTable key={`table-${blocks.length}`} header={header} rows={rows} />);
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      bullets.push((bullet ?? numbered)![1]);
      i += 1;
      continue;
    }

    flushBullets();

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // A lone "---" (or "***" / "___") is a horizontal rule, not a sentence.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={blocks.length} className="my-3 border-line" />);
      i += 1;
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    blocks.push(
      heading ? (
        <p key={blocks.length} className="mt-2 font-medium text-ink">
          {inline(heading[1])}
        </p>
      ) : (
        <p key={blocks.length} className="my-1.5 first:mt-0 last:mb-0">
          {inline(line)}
        </p>
      ),
    );
    i += 1;
  }
  flushBullets();

  return <div className="text-[0.875rem] leading-relaxed text-ink/90">{blocks}</div>;
}

/** A row that opens and closes with `|` and has at least one more `|` between. */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 1;
}

/** A separator row's cells contain only dashes, colons (alignment), and spaces. */
function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) return false;
  return splitRow(line).every((cell) => /^:?-+:?$/.test(cell.trim()));
}

/** "| a | b |" -> ["a", "b"], dropping the empty strings the leading/trailing pipes produce. */
function splitRow(line: string): string[] {
  const trimmed = line.trim().slice(1, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function AgentTable({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className="my-2.5 overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-[0.8125rem]">
        <thead>
          <tr className="bg-slate-tint/60">
            {header.map((cell, index) => (
              <th
                key={index}
                className="border-b border-line px-2.5 py-1.5 font-semibold text-ink/80 first:pl-3 last:pr-3"
              >
                {inline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={`${rowIndex % 2 === 1 ? "bg-panel/60" : ""} ${
                rowIndex === rows.length - 1 ? "" : "border-b border-line/50"
              }`}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-2.5 py-1.5 text-ink/90 first:pl-3 last:pr-3"
                >
                  {inline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `**bold**` and `` `code` ``, nothing else. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-medium text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code
          key={index}
          className="rounded-sm bg-slate-tint px-1 font-mono text-[0.8125em] text-ink"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
