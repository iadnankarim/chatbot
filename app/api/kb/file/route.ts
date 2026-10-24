import fs from "node:fs";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";
import { docsDir } from "@/lib/kb/ingest";
import { listDocuments } from "@/lib/kb/store";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

// Opens a Knowledge Base document (the "Sources" links in answers).  GET /api/kb/file?id=3
// PDFs open in the browser (the link adds #page=N); other files download.
// Anyone signed in can open documents of everyone or of their own department.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  const doc = listDocuments().find((d) => d.id === id);
  const allowed =
    doc && (user.role === "admin" || doc.department === null || doc.department.toLowerCase() === user.department.toLowerCase());
  if (!doc || !allowed) return Response.json({ error: "Document not found." }, { status: 404 });

  const file = path.join(docsDir(), doc.department ?? "", doc.filename);
  if (!fs.existsSync(file)) return Response.json({ error: "The file is missing on the server." }, { status: 404 });

  const ext = path.extname(doc.filename).toLowerCase();
  const inline = ext === ".pdf" || ext === ".png" || ext === ".jpg" || ext === ".jpeg";
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
    },
  });
}
