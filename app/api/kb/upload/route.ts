import { getSessionUser } from "@/lib/auth";
import { AdminError, reindex, saveDocument } from "@/lib/kb/ingest";

export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024;

// Admin only: add a PDF or Word file to the Knowledge Base (multipart form: file, department).
// An empty department means the document is visible to everyone.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AdminError("Choose a file first.");
    if (file.size > MAX_BYTES) throw new AdminError("The file is larger than 25 MB.");
    const department = String(form.get("department") ?? "").trim() || null;

    const saved = saveDocument(file.name, Buffer.from(await file.arrayBuffer()), department);
    const report = await reindex();
    return Response.json({ saved, report });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: e.message }, { status: 400 });
    console.error("[kb] upload failed:", e);
    return Response.json({ error: "Could not add the document." }, { status: 500 });
  }
}
