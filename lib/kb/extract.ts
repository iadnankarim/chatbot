// Text extraction for the Knowledge Base: PDF (page by page) and Word.
// Self-contained on purpose (no project imports) so it can also run as a plain Node script.
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export type PageText = {
  /** 1-based page number, or null when the format has no pages (Word). */
  page: number | null;
  text: string;
};

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;
const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]/g;
const MIRRORED: Record<string, string> = {
  "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«",
};

const countArabic = (s: string) => (s.match(ARABIC_SCRIPT) ?? []).length;

/**
 * Many Urdu PDFs store glyphs in on-screen order (left to right) using Arabic
 * "presentation form" characters, so plain extraction gives backwards, broken text.
 * This turns one visual line back into normal logical text.
 */
function visualLineToLogical(visual: string): string {
  const letters = visual.replace(/[^\p{L}]/gu, "");
  if (countArabic(letters) < letters.length / 2) return visual; // mostly Latin line

  // Reverse everything, then un-reverse runs of Latin letters/digits (numbers, English words).
  const reversed = Array.from(visual).reverse().join("");
  const fixedRuns = reversed.replace(/[A-Za-z0-9]+(?:[.,:/\-+][A-Za-z0-9]+)*/g, (run) =>
    Array.from(run).reverse().join(""),
  );
  // Brackets were drawn mirrored in the visual order, so mirror them back.
  const unmirrored = fixedRuns.replace(/[()[\]{}<>«»]/g, (c) => MIRRORED[c] ?? c);
  // Presentation forms (ﺎ ﯿ ﺋ ...) back to the normal Urdu letters.
  return unmirrored.replace(PRESENTATION_FORMS, (c) => c.normalize("NFKC"));
}

type TextItem = {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
};

async function extractArabicPage(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber: number,
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const { items } = await page.getTextContent();

  // Group glyph items into lines by their vertical position, left to right inside a line.
  const lines = new Map<number, TextItem[]>();
  for (const raw of items) {
    const item = raw as unknown as TextItem;
    if (typeof item.str !== "string" || !item.transform) continue;
    const y = Math.round(item.transform[5] / 3); // 3pt tolerance
    const line = lines.get(y) ?? [];
    line.push(item);
    lines.set(y, line);
  }

  return [...lines.entries()]
    .sort((a, b) => b[0] - a[0]) // top of the page first
    .map(([, line]) => {
      line.sort((a, b) => a.transform[4] - b.transform[4]);
      let visual = "";
      let prevEnd: number | null = null;
      for (const item of line) {
        const x = item.transform[4];
        // A visible gap without a space glyph still means a word break.
        if (prevEnd !== null && x - prevEnd > (item.height || 10) * 0.25 && !/\s$/.test(visual) && !/^\s/.test(item.str)) {
          visual += " ";
        }
        // pdf.js already flips multi-letter right-to-left items into reading order.
        // Put them back into on-screen order so the whole line can be flipped once.
        visual += item.dir === "rtl" ? Array.from(item.str).reverse().join("") : item.str;
        prevEnd = x + item.width;
      }
      return visualLineToLogical(visual.trim());
    })
    .filter(Boolean)
    .join("\n");
}

export async function extractPdfPages(data: Uint8Array): Promise<PageText[]> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  const plain = Array.isArray(text) ? text : [text];

  const pages: PageText[] = [];
  for (let i = 0; i < plain.length; i++) {
    // Pages with Urdu need the visual-order repair; English pages are already fine.
    const hasUrdu = countArabic(plain[i]) > 10;
    const body = hasUrdu ? await extractArabicPage(pdf, i + 1) : plain[i];
    pages.push({ page: i + 1, text: body.trim() });
  }
  return pages.filter((p) => p.text);
}

export async function extractDocxPages(data: Uint8Array): Promise<PageText[]> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
  const text = value.trim();
  // Word files do not store page numbers, so the whole file is one unnumbered block.
  return text ? [{ page: null, text }] : [];
}

export async function extractPages(filename: string, data: Uint8Array): Promise<PageText[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return extractPdfPages(data);
  if (lower.endsWith(".docx")) return extractDocxPages(data);
  throw new Error(`Unsupported file type: ${filename}`);
}
