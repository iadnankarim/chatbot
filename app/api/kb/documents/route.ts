import { getSessionUser } from "@/lib/auth";
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
