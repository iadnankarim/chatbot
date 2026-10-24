// A simple record of what happened: sign-ins, questions asked, admin actions. Used by the admin
// screen (activity log and usage figures). Server-side only.
import { getDb } from "@/lib/db";

export type EventAction =
  | "login" | "login_failed" | "logout" | "password_changed"
  | "chat" | "kb" | "file" | "kb_not_found"
  | "user_created" | "user_updated" | "password_reset"
  | "document_added" | "document_deleted" | "reindex"
  | "feedback_up" | "feedback_down";

const g = globalThis as unknown as { eventsReady?: boolean };

function db() {
  const d = getDb();
  if (!g.eventsReady) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        at       TEXT NOT NULL DEFAULT (datetime('now')),
        user_id  INTEGER,
        username TEXT,
        action   TEXT NOT NULL,
        detail   TEXT
      );
      CREATE INDEX IF NOT EXISTS events_at ON events(at);
      CREATE INDEX IF NOT EXISTS events_action ON events(action, at);
    `);
    g.eventsReady = true;
  }
  return d;
}

/** Never throws: a logging problem must not break the request being logged. */
export function logEvent(user: { id: number; username: string } | null, action: EventAction, detail?: string) {
  try {
    db()
      .prepare("INSERT INTO events (user_id, username, action, detail) VALUES (?, ?, ?, ?)")
      .run(user?.id ?? null, user?.username ?? null, action, detail ? detail.slice(0, 500) : null);
  } catch (e) {
    console.error("[events] could not write:", e);
  }
}

export type EventRow = { id: number; at: string; username: string | null; action: string; detail: string | null };

export const recentEvents = (limit = 100, actions?: EventAction[]) => {
  const where = actions?.length ? `WHERE action IN (${actions.map(() => "?").join(",")})` : "";
  return db()
    .prepare(`SELECT id, at, username, action, detail FROM events ${where} ORDER BY id DESC LIMIT ?`)
    .all(...(actions ?? []), limit) as unknown as EventRow[];
};

/** Counts per action since a number of days ago (SQLite UTC time). */
export const countsSince = (days: number) =>
  db()
    .prepare("SELECT action, COUNT(*) AS n FROM events WHERE at >= datetime('now', ?) GROUP BY action")
    .all(`-${days} days`) as unknown as { action: string; n: number }[];
