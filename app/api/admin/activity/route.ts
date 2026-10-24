import { getSessionUser } from "@/lib/auth";
import { countsSince, recentEvents } from "@/lib/events";
import { listDocuments } from "@/lib/kb/store";
import { kvListAll } from "@/lib/kv";
import { listUsers } from "@/lib/users";

// Admin only: usage figures, questions the documents could not answer, and the activity log.

const ACTIVITY = [
  "login", "login_failed", "password_changed", "password_reset", "user_created", "user_updated",
  "document_added", "document_deleted", "reindex",
] as const;

export async function GET() {
  const admin = await getSessionUser();
  if (!admin) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (admin.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });

  const users = listUsers();
  const docs = listDocuments();

  let chatsSaved = 0;
  for (const row of kvListAll("plpa:threads")) {
    try {
      chatsSaved += (JSON.parse(row.value) as { status?: string }[]).filter((t) => t.status !== "archived").length;
    } catch {}
  }

  const count = (rows: { action: string; n: number }[], action: string) => rows.find((r) => r.action === action)?.n ?? 0;
  const day = countsSince(1);
  const week = countsSince(7);

  return Response.json({
    stats: {
      users: users.length,
      activeUsers: users.filter((u) => !u.disabled).length,
      documents: docs.length,
      passages: docs.reduce((n, d) => n + d.chunks, 0),
      chatsSaved,
      questionsToday: { chat: count(day, "chat"), kb: count(day, "kb"), file: count(day, "file") },
      questionsWeek: { chat: count(week, "chat"), kb: count(week, "kb"), file: count(week, "file") },
      notFoundWeek: count(week, "kb_not_found"),
      failedLoginsWeek: count(week, "login_failed"),
    },
    notFound: recentEvents(30, ["kb_not_found"]),
    activity: recentEvents(60, [...ACTIVITY]),
  });
}
