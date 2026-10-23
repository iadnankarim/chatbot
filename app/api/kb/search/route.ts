import { getSessionUser } from "@/lib/auth";
import { embedQuery } from "@/lib/kb/embed";
import { search } from "@/lib/kb/store";

// Admin diagnostic: shows which chunks a question matches and their scores.
//   GET /api/kb/search?q=...&k=5
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "Admins only." }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "Missing q" }, { status: 400 });
  const k = Math.min(Number(url.searchParams.get("k")) || 5, 20);

  const hits = search(await embedQuery(q), { k, user });
  return Response.json({
    query: q,
    hits: hits.map((h) => ({
      score: Number(h.score.toFixed(3)),
      file: h.filename,
      page: h.page,
      text: h.text.slice(0, 120),
    })),
  });
}
