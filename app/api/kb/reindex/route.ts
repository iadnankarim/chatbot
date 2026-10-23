import { getSessionUser } from "@/lib/auth";
import { reindex } from "@/lib/kb/ingest";

export const maxDuration = 300;

// Admin only: reads the documents folder into the Knowledge Base (new or changed files only).
export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "Admins only." }, { status: 403 });
  }
  try {
    return Response.json(await reindex());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Reindex failed" },
      { status: 500 },
    );
  }
}
