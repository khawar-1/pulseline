import { Fragment } from "react";

/**
 * Minimal markdown rendering for the agent's replies.
 *
 * Deliberately not a markdown library. The agent writes short operational
 * answers — paragraphs, bullets, the occasional bolded lead name — and a
 * parser that only handles those cannot inject anything, needs no dependency,
 * and cannot render a heading three times the size of the pane.
 */
export function AgentText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1.5 space-y-1 pl-1">
        {bullets.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-[0.45em] size-1 shrink-0 rounded-full bg-slate" aria-hidden />
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (bullet || numbered) {
      bullets.push((bullet ?? numbered)![1]);
      continue;
    }

    flush();
    if (!line.trim()) continue;

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
  }
  flush();

  return <div className="text-[0.875rem] leading-relaxed text-ink/90">{blocks}</div>;
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
