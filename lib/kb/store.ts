// Vector store for the Knowledge Base, kept in SQLite (POC). Search is a plain cosine
// scan in memory, which is fast for a few thousand chunks. For production this file is
// the only place to swap for Qdrant.
import { getDb } from "@/lib/db";

export type Hit = {
  score: number;
  docId: number;
  filename: string;
  page: number | null;
  text: string;
};

export type DocumentRow = {
  id: number;
  filename: string;
  department: string | null;
  pages: number;
  chunks: number;
  size: number;
  mtime: number;
};

type CachedChunk = {
  docId: number;
  filename: string;
  department: string | null;
  page: number | null;
  text: string;
  vec: Float32Array;
};

const g = globalThis as unknown as { kbSchema?: boolean; kbCache?: CachedChunk[] | null };

function db() {
  const d = getDb();
  if (!g.kbSchema) {
    d.exec("PRAGMA foreign_keys = ON");
    d.exec(`
      CREATE TABLE IF NOT EXISTS kb_documents (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        filename   TEXT NOT NULL,
        department TEXT,
        pages      INTEGER NOT NULL,
        size       INTEGER NOT NULL,
        mtime      INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (filename, department)
      );
      CREATE TABLE IF NOT EXISTS kb_chunks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id      INTEGER NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
        page        INTEGER,
        chunk_index INTEGER NOT NULL,
        text        TEXT NOT NULL,
        embedding   BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS kb_chunks_doc ON kb_chunks(doc_id);
    `);
    g.kbSchema = true;
  }
  return d;
}

const toBlob = (v: Float32Array) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
const fromBlob = (b: Uint8Array) => new Float32Array(b.slice().buffer);

export function listDocuments(): DocumentRow[] {
  return db()
    .prepare(
      `SELECT d.id, d.filename, d.department, d.pages, d.size, d.mtime,
              (SELECT COUNT(*) FROM kb_chunks c WHERE c.doc_id = d.id) AS chunks
       FROM kb_documents d ORDER BY d.filename`,
    )
    .all() as unknown as DocumentRow[];
}

export function removeDocument(id: number) {
  db().prepare("DELETE FROM kb_documents WHERE id = ?").run(id);
  g.kbCache = null;
}

export function addDocument(
  doc: { filename: string; department: string | null; pages: number; size: number; mtime: number },
  chunks: { page: number | null; index: number; text: string; vec: Float32Array }[],
) {
  const d = db();
  d.exec("BEGIN");
  try {
    d.prepare("DELETE FROM kb_documents WHERE filename = ? AND department IS ?").run(
      doc.filename,
      doc.department,
    );
    const res = d
      .prepare(
        "INSERT INTO kb_documents (filename, department, pages, size, mtime) VALUES (?, ?, ?, ?, ?)",
      )
      .run(doc.filename, doc.department, doc.pages, doc.size, doc.mtime);
    const docId = Number(res.lastInsertRowid);
    const insert = d.prepare(
      "INSERT INTO kb_chunks (doc_id, page, chunk_index, text, embedding) VALUES (?, ?, ?, ?, ?)",
    );
    for (const c of chunks) insert.run(docId, c.page, c.index, c.text, toBlob(c.vec));
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  g.kbCache = null;
}

function loadAll(): CachedChunk[] {
  if (g.kbCache) return g.kbCache;
  const rows = db()
    .prepare(
      `SELECT c.doc_id AS docId, d.filename, d.department, c.page, c.text, c.embedding
       FROM kb_chunks c JOIN kb_documents d ON d.id = c.doc_id`,
    )
    .all() as unknown as (Omit<CachedChunk, "vec"> & { embedding: Uint8Array })[];
  g.kbCache = rows.map(({ embedding, ...r }) => ({ ...r, vec: fromBlob(embedding) }));
  return g.kbCache;
}

/**
 * Best matching chunks. Admins see everything; other users see documents that are
 * shared with everyone (no department) or belong to their own department.
 */
export function search(
  query: Float32Array,
  opts: { k: number; user: { role: string; department: string } },
): Hit[] {
  const dept = opts.user.department.toLowerCase();
  const visible = (c: CachedChunk) =>
    opts.user.role === "admin" || c.department === null || c.department.toLowerCase() === dept;

  const hits: Hit[] = [];
  for (const c of loadAll()) {
    if (!visible(c)) continue;
    let dot = 0;
    for (let i = 0; i < query.length; i++) dot += query[i] * c.vec[i];
    hits.push({ score: dot, docId: c.docId, filename: c.filename, page: c.page, text: c.text });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, opts.k);
}
