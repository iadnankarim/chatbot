// SQLite database (Node's built-in node:sqlite, so no extra package). Server-side only.
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo-users";

export type UserRow = {
  id: number;
  username: string;
  name: string;
  department: string;
  role: "admin" | "user";
  password_hash: string;
};

// Reused across dev hot reloads so we do not open the file many times.
const globalForDb = globalThis as unknown as { plpaDb?: DatabaseSync };

function open() {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(path.join(dir, "plpa.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      department    TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as {
    n: number;
  };
  if (n === 0) {
    const insert = db.prepare(
      "INSERT INTO users (username, name, department, role, password_hash) VALUES (?, ?, ?, ?, ?)",
    );
    const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
    for (const u of DEMO_USERS) {
      insert.run(u.username, u.name, u.department, u.role, hash);
    }
  }
  return db;
}

export const getDb = () => (globalForDb.plpaDb ??= open());

export const findUserByUsername = (username: string) =>
  getDb()
    .prepare(
      "SELECT id, username, name, department, role, password_hash FROM users WHERE username = ?",
    )
    .get(username.trim().toLowerCase()) as unknown as UserRow | undefined;
