// Small per-user key-value store in SQLite. The chat saves each user's threads and messages
// here (see lib/server-storage.ts), so a user's chats are only ever read with their own id.
import { getDb } from "@/lib/db";

const g = globalThis as unknown as { kvReady?: boolean };

function db() {
  const d = getDb();
  if (!g.kvReady) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS user_kv (
        user_id    INTEGER NOT NULL,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, key)
      )
    `);
    g.kvReady = true;
  }
  return d;
}

export const kvGet = (userId: number, key: string) =>
  (
    db().prepare("SELECT value FROM user_kv WHERE user_id = ? AND key = ?").get(userId, key) as
      | { value: string }
      | undefined
  )?.value ?? null;

export const kvSet = (userId: number, key: string, value: string) => {
  db()
    .prepare(
      `INSERT INTO user_kv (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(userId, key, value);
};

export const kvDelete = (userId: number, key: string) => {
  db().prepare("DELETE FROM user_kv WHERE user_id = ? AND key = ?").run(userId, key);
};

/** Admin audit: every stored row of every user whose key starts with the prefix. */
export const kvListAll = (prefix: string) =>
  db()
    .prepare(
      `SELECT k.user_id AS userId, u.username, u.name, u.department, k.key, k.value, k.updated_at AS updatedAt
       FROM user_kv k JOIN users u ON u.id = k.user_id WHERE k.key LIKE ? ORDER BY k.updated_at DESC`,
    )
    .all(`${prefix}%`) as unknown as {
    userId: number;
    username: string;
    name: string;
    department: string;
    key: string;
    value: string;
    updatedAt: string;
  }[];
