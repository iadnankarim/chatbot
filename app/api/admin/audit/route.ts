import { getSessionUser } from "@/lib/auth";
import { kvListAll } from "@/lib/kv";

// Admin only: chat audit. Lists every user's saved chats, or the messages of one chat.
//   GET /api/admin/audit                          -> users and their chats
//   GET /api/admin/audit?user=2&thread=<id>       -> the messages of that chat
//
// Chats are stored by the chat library (see lib/server-storage.ts) as
//   plpa:threads                                  JSON list of { remoteId, title, status }
//   plpa:formatted-messages:["<id>","<format>"]   JSON { messages: [{ id, content: { role, parts } }] }

type StoredThread = { remoteId: string; title?: string; status?: string };
type StoredPart = { type: string; text?: string; filename?: string };
type StoredMessage = { id: string; content?: { role?: string; parts?: StoredPart[] } };

const parse = <T,>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const textOf = (m: StoredMessage) =>
  (m.content?.parts ?? [])
    .map((p) => (p.type === "text" ? (p.text ?? "") : p.type === "file" ? `[attached file: ${p.filename ?? "file"}]` : ""))
    .filter(Boolean)
    .join("\n");

export async function GET(req: Request) {
  const admin = await getSessionUser();
  if (!admin) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (admin.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });

  const rows = kvListAll("plpa:");
  const messagesOf = (userId: number, threadId: string) => {
    const row = rows.find(
      (r) => r.userId === userId && r.key.startsWith("plpa:formatted-messages:") && r.key.includes(`${JSON.stringify(threadId)},`),
    );
    const stored = row ? parse<{ messages?: StoredMessage[] }>(row.value, {}) : {};
    return { messages: stored.messages ?? [], updatedAt: row?.updatedAt ?? null };
  };

  const url = new URL(req.url);
  const userParam = url.searchParams.get("user");
  const threadParam = url.searchParams.get("thread");

  if (userParam && threadParam) {
    const { messages } = messagesOf(Number(userParam), threadParam);
    return Response.json({
      messages: messages.map((m) => ({ role: m.content?.role ?? "unknown", text: textOf(m) })),
    });
  }

  const byUser = new Map<number, { userId: number; username: string; name: string; department: string; threads: unknown[] }>();
  for (const row of rows) {
    if (row.key !== "plpa:threads") continue;
    const threads = parse<StoredThread[]>(row.value, []).filter((t) => t.status !== "archived");
    byUser.set(row.userId, {
      userId: row.userId,
      username: row.username,
      name: row.name,
      department: row.department,
      threads: threads.map((t) => {
        const { messages, updatedAt } = messagesOf(row.userId, t.remoteId);
        return { id: t.remoteId, title: t.title || "New Chat", messageCount: messages.length, updatedAt };
      }),
    });
  }
  return Response.json({ users: [...byUser.values()] });
}
