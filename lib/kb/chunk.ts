// Splits document text into chunks that remember which page(s) they came from.
// Chunks may run across a page break (a sentence or a list often continues on the next
// page), so each chunk keeps a page range and the source can say "pages 18-19".
import type { PageText } from "@/lib/kb/extract";

export type Chunk = {
  /** First page of the chunk, or null for formats without pages (Word). */
  page: number | null;
  /** Last page of the chunk (same as page when it fits on one page). */
  pageEnd: number | null;
  index: number;
  text: string;
};

const MAX_CHARS = 800;
const OVERLAP_CHARS = 120;

// Sentence ends in English and Urdu (۔ and ؟), plus line breaks.
const SENTENCE_SPLIT = /(?<=[.!?؟۔])\s+|\n+/;

type Sentence = { text: string; page: number | null };

export function chunkPages(pages: PageText[]): Chunk[] {
  const sentences: Sentence[] = [];
  for (const { page, text } of pages) {
    for (const s of text.split(SENTENCE_SPLIT).map((t) => t.trim()).filter(Boolean)) {
      sentences.push({ text: s, page });
    }
  }

  const chunks: Chunk[] = [];
  const size = (list: Sentence[]) => list.reduce((n, s) => n + s.text.length + 1, 0);

  let current: Sentence[] = [];
  const flush = () => {
    if (!current.length) return;
    const numbers = current.map((s) => s.page).filter((p): p is number => p !== null);
    chunks.push({
      page: numbers.length ? Math.min(...numbers) : null,
      pageEnd: numbers.length ? Math.max(...numbers) : null,
      index: chunks.length,
      text: current.map((s) => s.text).join(" "),
    });
  };

  for (const sentence of sentences) {
    if (current.length && size(current) + sentence.text.length + 1 > MAX_CHARS) {
      flush();
      // The next chunk starts with the last sentence(s) of this one, for context.
      const keep: Sentence[] = [];
      let n = 0;
      for (let i = current.length - 1; i >= 0 && n < OVERLAP_CHARS; i--) {
        keep.unshift(current[i]);
        n += current[i].text.length + 1;
      }
      current = keep.length === current.length ? [] : keep;
    }
    current.push(sentence);
  }
  flush();
  return chunks;
}
