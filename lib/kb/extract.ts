// Text extraction for the Knowledge Base: PDF (page by page) and Word.
// Self-contained on purpose (no project imports) so it can also run as a plain Node script.
import JSZip from "jszip";
import mammoth from "mammoth";
import readExcelFile from "read-excel-file/node";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { OCR_MAX_PAGES, ocrImage } from "./ocr";

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

/** Letter trigrams of a line, ignoring digits, punctuation and case. */
function trigrams(line: string) {
  const letters = line.toLowerCase().replace(/[^\p{L}]/gu, "");
  const out = new Set<string>();
  for (let i = 0; i + 3 <= letters.length; i++) out.add(letters.slice(i, i + 3));
  return out;
}

function similar(a: Set<string>, b: Set<string>) {
  if (a.size < 4 || b.size < 4) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared) >= 0.55;
}

/**
 * Removes running headers and footers (document title, "Page 2 / 5", gazette banners):
 * lines at the top or bottom of a page that repeat on at least half of the pages.
 * They carry no facts, and left in they dilute every chunk they end up in.
 * "Repeat" means very similar, not identical: scanned pages differ by page number and OCR slips.
 */
export function stripRunningHeaders(pages: PageText[]): PageText[] {
  if (pages.length < 2) return pages;
  const needed = Math.max(2, Math.ceil(pages.length / 2));

  const edgeOf = (lines: string[]) =>
    lines.map((line, i) => ({ i, set: trigrams(line) })).filter(({ i }) => i < 2 || i >= lines.length - 2);
  const perPage = pages.map((p) => edgeOf(p.text.split("\n")));

  return pages.map((p, pi) => {
    const lines = p.text.split("\n");
    const drop = new Set<number>();
    for (const { i, set } of perPage[pi]) {
      const pageNumberOnly = /^\s*(?:page|صفحہ)?\s*\d+\s*(?:\/\s*\d+)?\s*$/i.test(lines[i]);
      let pagesWithIt = 1;
      for (let other = 0; other < pages.length; other++) {
        if (other !== pi && perPage[other].some((e) => similar(set, e.set))) pagesWithIt++;
      }
      if (pageNumberOnly || pagesWithIt >= needed) drop.add(i);
    }
    return { ...p, text: lines.filter((_, i) => !drop.has(i)).join("\n").trim() };
  });
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

  // Pages without a text layer are scans (pictures of pages): read them with OCR.
  let ocrDone = 0;
  for (const p of pages) {
    if (p.text.replace(/\s/g, "").length >= 25 || ocrDone >= OCR_MAX_PAGES) continue;
    const png = await renderPageAsImage(pdf, p.page as number, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 });
    p.text = await ocrImage(new Uint8Array(png));
    ocrDone++;
  }
  return stripRunningHeaders(pages).filter((p) => p.text);
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ",
};
const decodeEntities = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => HTML_ENTITIES[e] ?? e);
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

/**
 * Word -> plain text where every table row stays on ONE line ("19. Stakeholder Portal | Phase 2 |
 * Month 8 to 11"). Plain text extraction puts each cell on its own line, which loses which phase,
 * date or fee belongs to which row.
 */
function wordHtmlToText(html: string): string {
  const withTables = html.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_, row: string) => {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) =>
      // Several paragraphs inside one cell (a list of modules) stay together, separated by ";".
      decodeEntities(
        stripTags(m[1].replace(/<\/(?:p|li)>/g, "; ")),
      )
        .replace(/\s+/g, " ")
        .replace(/(?:;\s*)+$/, "")
        .trim(),
    );
    return `<p>${cells.filter(Boolean).join(" | ")}</p>`;
  });
  return decodeEntities(
    stripTags(withTables.replace(/<\/(?:p|h[1-6]|li|div|table)>|<br\s*\/?>/g, "\n")),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocxPages(data: Uint8Array): Promise<PageText[]> {
  const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
  const text = wordHtmlToText(value);
  // Word files do not store page numbers, so the whole file is one unnumbered block.
  return text ? [{ page: null, text }] : [];
}

/** Excel: one block per sheet, each row on one line as "a | b | c". */
export async function extractXlsxPages(data: Uint8Array): Promise<PageText[]> {
  const sheets = await readExcelFile(Buffer.from(data));
  const pages: PageText[] = [];
  sheets.forEach((s, i) => {
    const rows = s.data
      .map((row) =>
        row
          .map((cell) =>
            cell instanceof Date ? cell.toISOString().slice(0, 10) : cell === null || cell === undefined ? "" : String(cell),
          )
          .join(" | ")
          .replace(/(?:\s*\|\s*)+$/, "")
          .trim(),
      )
      .filter(Boolean);
    if (rows.length) pages.push({ page: i + 1, text: `Sheet "${s.sheet}"\n${rows.join("\n")}` });
  });
  return pages;
}

/** PowerPoint: one page per slide, the text of every paragraph on its own line. */
export async function extractPptxPages(data: Uint8Array): Promise<PageText[]> {
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .map((name) => ({ name, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(name)?.[1]) }))
    .filter((s) => Number.isInteger(s.n))
    .sort((a, b) => a.n - b.n);
  const pages: PageText[] = [];
  for (const [i, s] of slides.entries()) {
    const xml = await zip.files[s.name].async("string");
    const lines = [...xml.matchAll(/<a:p[ >][\s\S]*?<\/a:p>/g)]
      .map((p) => decodeEntities([...p[0].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((t) => t[1]).join("")).trim())
      .filter(Boolean);
    if (lines.length) pages.push({ page: i + 1, text: lines.join("\n") });
  }
  return pages;
}

export async function extractPages(filename: string, data: Uint8Array): Promise<PageText[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return extractPdfPages(data);
  if (lower.endsWith(".docx")) return extractDocxPages(data);
  if (lower.endsWith(".xlsx")) return extractXlsxPages(data);
  if (lower.endsWith(".pptx")) return extractPptxPages(data);
  if (/\.(png|jpe?g)$/.test(lower)) {
    const text = await ocrImage(data);
    return text ? [{ page: null, text }] : [];
  }
  throw new Error(`Unsupported file type: ${filename}`);
}
