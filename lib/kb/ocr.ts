// OCR for scanned pages and pictures. Runs fully offline: the Urdu and English language
// files are in ocr-data/ (downloaded once, kept in the project), nothing is fetched at run time.
// Self-contained (no project imports) like extract.ts.
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";

const LANGS = "urd+eng";
const LANG_DIR = process.env.OCR_DATA_DIR ?? path.join(process.cwd(), "ocr-data");

/** Most pages read by OCR from one file (it is slow on a CPU-only machine). */
export const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES ?? 15);

const g = globalThis as unknown as { ocrWorker?: Promise<Worker>; ocrQueue?: Promise<unknown> };

function worker() {
  g.ocrWorker ??= createWorker(LANGS, 1, { langPath: LANG_DIR, gzip: false, cacheMethod: "none" });
  return g.ocrWorker;
}

/** Reads the text of one image (PNG/JPEG bytes). One image at a time: the worker is shared. */
export function ocrImage(image: Uint8Array): Promise<string> {
  const job = (g.ocrQueue ?? Promise.resolve()).then(async () => {
    const { data } = await (await worker()).recognize(Buffer.from(image));
    return tidyOcr(data.text);
  });
  g.ocrQueue = job.catch(() => {});
  return job;
}

// Scans often leave stray marks on their own lines; keep lines that contain a letter or digit.
const tidyOcr = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => /[\p{L}\p{N}]{2,}/u.test(l))
    .join("\n");
