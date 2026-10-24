// Server-side helper: who is logged in for this request? Use inside route handlers.
//
// The signed cookie proves who the user is; the database says whether the account is still
// allowed in and what its role is now. So switching an account off or changing its role works
// at once, not only after the cookie expires.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionUser } from "@/lib/session";
import { getUserById } from "@/lib/users";

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const fromCookie = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!fromCookie) return null;

  const user = getUserById(fromCookie.id);
  if (!user || user.disabled) return null;
  return { id: user.id, username: user.username, name: user.name, department: user.department, role: user.role };
}
