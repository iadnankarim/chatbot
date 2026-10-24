import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { getLoginRow, setPassword, UserError } from "@/lib/users";

// A logged-in user changes their own password (needs the current one).
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";

  const row = getLoginRow(user.username);
  if (!row || !(await bcrypt.compare(current, row.passwordHash))) {
    return Response.json({ error: "The current password is not correct." }, { status: 400 });
  }
  if (next === current) {
    return Response.json({ error: "Choose a password different from the current one." }, { status: 400 });
  }
  try {
    setPassword(user.id, next);
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  logEvent(user, "password_changed");
  return Response.json({ ok: true });
}
