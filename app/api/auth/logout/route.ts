import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  logEvent(await getSessionUser(), "logout");
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
