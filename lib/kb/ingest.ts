// Reads documents from a folder into the Knowledge Base.
//   <docs dir>/file.pdf             -> visible to everyone
//   <docs dir>/Finance/file.pdf     -> visible to the Finance department (and admins)
import fs from "node:fs";
import path from "node:path";
import { chunkPages } from "@/lib/kb/chunk";
import { embedTexts } from "@/lib/kb/embed";
import { extractPages } from "@/lib/kb/extract";
import { addDocument, listDocuments, removeDocument } from "@/lib/kb/store";

export const docsDir = () =>
  process.env.KB_DOCS_DIR ?? path.resolve(process.cwd(), "..", "sample-docs");

type Found = { filename: string; department: string | null; full: string; size: number; mtime: number };

function scan(dir: string): Found[] {
  const found: Found[] = [];
  const walk = (current: string, department: string | null) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // Only the first folder level names a department.
        walk(full, department ?? entry.name);
      } else if (/\.(pdf|docx)$/i.test(entry.name)) {
        const stat = fs.statSync(full);
        found.push({ filename: entry.name, department, full, size: stat.size, mtime: Math.floor(stat.mtimeMs) });
      }
    }
  };
  walk(dir, null);
  return found;
}

const title = (filename: string) => filename.replace(/\.[^.]+$/, "").replace(/_/g, " ");

export type IngestReport = {
  dir: string;
  added: string[];
  skipped: string[];
  removed: string[];
  failed: { file: string; error: string }[];
};

/** force = read every file again, even if it looks unchanged (after the reading code improved). */
export async function reindex(dir = docsDir(), force = false): Promise<IngestReport> {
  const report: IngestReport = { dir, added: [], skipped: [], removed: [], failed: [] };
  if (!fs.existsSync(dir)) throw new Error(`Documents folder not found: ${dir}`);

  const files = scan(dir);
  const existing = listDocuments();
  const key = (f: string, d: string | null) => `${d ?? ""}/${f}`;
  const onDisk = new Set(files.map((f) => key(f.filename, f.department)));

  for (const doc of existing) {
    if (!onDisk.has(key(doc.filename, doc.department))) {
      removeDocument(doc.id);
      report.removed.push(doc.filename);
    }
  }

  for (const f of files) {
    const same = force ? undefined : existing.find(
      (d) => d.filename === f.filename && d.department === f.department && d.size === f.size && d.mtime === f.mtime,
    );
    if (same) {
      report.skipped.push(f.filename);
      continue;
    }
    try {
      const pages = await extractPages(f.filename, new Uint8Array(fs.readFileSync(f.full)));
      const chunks = chunkPages(pages);
      if (!chunks.length) throw new Error("No readable text found (scanned file? OCR is needed)");
      const vectors = await embedTexts(chunks.map((c) => `${title(f.filename)}\n${c.text}`));
      addDocument(
        { filename: f.filename, department: f.department, pages: pages.length, size: f.size, mtime: f.mtime },
        chunks.map((c, i) => ({ ...c, vec: vectors[i] })),
      );
      report.added.push(f.filename);
    } catch (e) {
      report.failed.push({ file: f.filename, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}

// ---------------------------------------------------------------------------------------------
// Admin helpers: adding and removing documents from the documents folder.

const SAFE_DEPARTMENT = /^[\p{L}\p{N} _-]{1,40}$/u;

/** A file name that cannot climb out of the documents folder or hide an odd extension. */
export const safeFilename = (name: string) =>
  path.basename(name).replace(/[^\p{L}\p{N} ._()-]/gu, "_");

export class AdminError extends Error {}

/** Saves an uploaded file into the documents folder (a department sub-folder when given). */
export function saveDocument(filename: string, data: Buffer, department: string | null) {
  const name = safeFilename(filename);
  if (!/\.(pdf|docx)$/i.test(name)) throw new AdminError("Only PDF and Word (.docx) files can be added.");
  if (department !== null && !SAFE_DEPARTMENT.test(department)) throw new AdminError("Invalid department name.");

  const dir = department ? path.join(docsDir(), department) : docsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), data);
  return name;
}

/** Removes a document from the index and deletes its file, so the next reindex does not bring it back. */
export function deleteDocument(id: number) {
  const doc = listDocuments().find((d) => d.id === id);
  if (!doc) return false;
  removeDocument(id);

  const root = path.resolve(docsDir());
  const file = path.resolve(root, doc.department ?? "", doc.filename);
  if (file.startsWith(root + path.sep) && fs.existsSync(file)) {
    fs.unlinkSync(file);
    // Do not leave an empty department folder behind.
    const dir = path.dirname(file);
    if (dir !== root && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
  return true;
}
