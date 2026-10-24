// User accounts: lookups, creating users, changing passwords, switching accounts off.
// Passwords are stored as bcrypt hashes only. Server-side only.
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

export type UserRecord = {
  id: number;
  username: string;
  name: string;
  department: string;
  role: "admin" | "user";
  disabled: boolean;
  createdAt: string;
};

export const MIN_PASSWORD_LENGTH = 8;
const USERNAME_OK = /^[a-z0-9._-]{3,32}$/;

export class UserError extends Error {}

const g = globalThis as unknown as { usersReady?: boolean };

function db() {
  const d = getDb();
  if (!g.usersReady) {
    // Added after the first version of the table: an account can be switched off instead of deleted.
    const cols = d.prepare("PRAGMA table_info(users)").all() as unknown as { name: string }[];
    if (!cols.some((c) => c.name === "disabled")) {
      d.exec("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0");
    }
    g.usersReady = true;
  }
  return d;
}

type Row = {
  id: number; username: string; name: string; department: string; role: string;
  disabled: number; created_at: string; password_hash: string;
};

const toRecord = (r: Row): UserRecord => ({
  id: r.id,
  username: r.username,
  name: r.name,
  department: r.department,
  role: r.role === "admin" ? "admin" : "user",
  disabled: r.disabled === 1,
  createdAt: r.created_at,
});

const SELECT = "SELECT id, username, name, department, role, disabled, created_at, password_hash FROM users";

export const listUsers = () => (db().prepare(`${SELECT} ORDER BY id`).all() as unknown as Row[]).map(toRecord);

export const getUserById = (id: number) => {
  const r = db().prepare(`${SELECT} WHERE id = ?`).get(id) as unknown as Row | undefined;
  return r ? toRecord(r) : undefined;
};

/** For login: the record plus the password hash. */
export const getLoginRow = (username: string) => {
  const r = db().prepare(`${SELECT} WHERE username = ?`).get(username.trim().toLowerCase()) as unknown as Row | undefined;
  return r ? { ...toRecord(r), passwordHash: r.password_hash } : undefined;
};

const activeAdmins = () => listUsers().filter((u) => u.role === "admin" && !u.disabled);

export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new UserError(`The password must have at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > 128) throw new UserError("The password is too long.");
}

export function createUser(input: { username: string; name: string; department: string; role: string; password: string }) {
  const username = input.username.trim().toLowerCase();
  const name = input.name.trim();
  const department = input.department.trim();
  if (!USERNAME_OK.test(username)) throw new UserError("Username: 3 to 32 letters, digits, dot, dash or underscore.");
  if (name.length < 2 || name.length > 80) throw new UserError("Enter the person's full name.");
  if (department.length < 2 || department.length > 40) throw new UserError("Enter the department.");
  if (input.role !== "admin" && input.role !== "user") throw new UserError("Role must be admin or user.");
  validatePassword(input.password);
  if (getLoginRow(username)) throw new UserError("That username is already taken.");

  const res = db()
    .prepare("INSERT INTO users (username, name, department, role, password_hash) VALUES (?, ?, ?, ?, ?)")
    .run(username, name, department, input.role, bcrypt.hashSync(input.password, 10));
  return getUserById(Number(res.lastInsertRowid))!;
}

export function setPassword(id: number, password: string) {
  validatePassword(password);
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(password, 10), id);
}

/** Changes role / department / disabled. Never leaves the system without an active admin. */
export function updateUser(id: number, patch: { role?: string; department?: string; disabled?: boolean }) {
  const user = getUserById(id);
  if (!user) throw new UserError("User not found.");

  const role = patch.role ?? user.role;
  const disabled = patch.disabled ?? user.disabled;
  if (role !== "admin" && role !== "user") throw new UserError("Role must be admin or user.");
  const department = (patch.department ?? user.department).trim();
  if (department.length < 2 || department.length > 40) throw new UserError("Enter the department.");

  const losesAdmin = user.role === "admin" && !user.disabled && (role !== "admin" || disabled);
  if (losesAdmin && activeAdmins().length <= 1) throw new UserError("There must be at least one active admin.");

  db().prepare("UPDATE users SET role = ?, department = ?, disabled = ? WHERE id = ?").run(role, department, disabled ? 1 : 0, id);
  return getUserById(id)!;
}
