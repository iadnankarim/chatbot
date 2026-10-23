// Splits page text into chunks that keep their page number for citations.
import type { PageText } from "@/lib/kb/extract";

export type Chunk = { page: number | null; index: number; text: string };

const MAX_CHARS = 800;
const OVERLAP_CHARS = 120;

// Sentence ends in English and Urdu (۔ and ؟), plus line breaks.
const SENTENCE_SPLIT = /(?<=[.!?؟۔])\s+|\n+/;

export function chunkPages(pages: PageText[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const { page, text } of pages) {
    const sentences = text
      .split(SENTENCE_SPLIT)
      .map((s) => s.trim())
      .filter(Boolean);

    let current = "";
    const flush = () => {
      const t = current.trim();
      if (t) chunks.push({ page, index: chunks.length, text: t });
    };

    for (const sentence of sentences) {
      if (current && current.length + sentence.length + 1 > MAX_CHARS) {
        flush();
        // Start the next chunk with the tail of the previous one for context.
        current = current.slice(-OVERLAP_CHARS).replace(/^\S*\s/, "");
      }
      current += (current ? " " : "") + sentence;
    }
    flush();
  }
  return chunks;
}
