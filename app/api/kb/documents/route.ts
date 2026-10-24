import { getSessionUser } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { deleteDocument } from "@/lib/kb/ingest";
import { listDocuments } from "@/lib/kb/store";

// Admin only: what is currently in the Knowledge Base.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "Admins only." }, { status: 403 });
  }
  return Response.json({ documents: listDocuments() });
}

// Admin only: remove a document (index entries and the file itself).  DELETE /api/kb/documents?id=3
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "Admins only." }, { status: 403 });
  }
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "Missing id." }, { status: 400 });
  const doc = listDocuments().find((d) => d.id === id);
  if (!doc || !deleteDocument(id)) return Response.json({ error: "Document not found." }, { status: 404 });
  logEvent(user, "document_deleted", doc.filename);
  return Response.json({ ok: true });
}
