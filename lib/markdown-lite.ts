// The few Markdown features the assistant uses in answers: headings, bullets, numbered
// lines, **bold** and plain paragraphs. Shared by the Word and PDF downloads.
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string };

export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim() || /^-{3,}$/.test(line.trim())) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*(?:[*\-•]|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) blocks.push({ kind: "heading", text: heading[1] });
    else if (bullet) blocks.push({ kind: "bullet", text: bullet[1] });
    else blocks.push({ kind: "paragraph", text: line.trim() });
  }
  return blocks;
}

/** Splits "a **b** c" into runs so bold can be applied. */
export function toRuns(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((t) =>
      t.startsWith("**") && t.endsWith("**")
        ? { text: t.slice(2, -2), bold: true }
        : { text: t.replace(/\*/g, ""), bold: false },
    );
}
