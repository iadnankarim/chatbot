// Server-side helper: who is logged in for this request? Use inside route handlers.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export async function getSessionUser() {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}
