import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { logEvent } from "@/lib/events";
import { getLoginRow } from "@/lib/users";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/session";

// Compared against when the username does not exist, so a wrong username and a
// wrong password take about the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// Simple brute-force guard: 5 wrong passwords lock that username for a minute.
const MAX_FAILS = 5;
const LOCK_MS = 60_000;
const globalForLock = globalThis as unknown as {
  loginFails?: Map<string, { count: number; until: number }>;
};
const fails = (globalForLock.loginFails ??= new Map());

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return Response.json(
      { error: "Please enter your username and password." },
      { status: 400 },
    );
  }

  const key = username.toLowerCase();
  const entry = fails.get(key);
  if (entry && entry.until > Date.now()) {
    return Response.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  const user = getLoginRow(username);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    logEvent(user ?? null, "login_failed", user ? undefined : username);
    const count = (entry?.count ?? 0) + 1;
    fails.set(
      key,
      count >= MAX_FAILS
        ? { count: 0, until: Date.now() + LOCK_MS }
        : { count, until: 0 },
    );
    return Response.json(
      { error: "Incorrect username or password." },
      { status: 401 },
    );
  }

  if (user.disabled) {
    logEvent(user, "login_failed", "account switched off");
    return Response.json(
      { error: "This account has been switched off. Please contact the administrator." },
      { status: 403 },
    );
  }

  fails.delete(key);
  const sessionUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    department: user.department,
    role: user.role,
  };
  (await cookies()).set(SESSION_COOKIE, await signSession(sessionUser), sessionCookieOptions);
  logEvent(sessionUser, "login");
  return Response.json({ user: sessionUser });
}
