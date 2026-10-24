import { getSessionUser } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { createUser, getUserById, listUsers, setPassword, updateUser, UserError } from "@/lib/users";

// Admin only: list accounts, create one, change one (role, department, switched off, new password).
// Password hashes are never returned.

async function admin() {
  const user = await getSessionUser();
  if (!user) return { error: Response.json({ error: "Please sign in." }, { status: 401 }) } as const;
  if (user.role !== "admin") return { error: Response.json({ error: "Admins only." }, { status: 403 }) } as const;
  return { user } as const;
}

const fail = (e: unknown) => {
  if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
  console.error("[admin/users]", e);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
};

export async function GET() {
  const a = await admin();
  if ("error" in a) return a.error;
  return Response.json({ users: listUsers() });
}

export async function POST(req: Request) {
  const a = await admin();
  if ("error" in a) return a.error;
  const body = await req.json().catch(() => ({}));
  try {
    const created = createUser({
      username: String(body.username ?? ""),
      name: String(body.name ?? ""),
      department: String(body.department ?? ""),
      role: String(body.role ?? "user"),
      password: String(body.password ?? ""),
    });
    logEvent(a.user, "user_created", `${created.username} (${created.department}, ${created.role})`);
    return Response.json({ user: created });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request) {
  const a = await admin();
  if ("error" in a) return a.error;
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const target = getUserById(id);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });

  try {
    if (typeof body.password === "string") {
      setPassword(id, body.password);
      logEvent(a.user, "password_reset", target.username);
    }
    const patch: { role?: string; department?: string; disabled?: boolean } = {};
    if (typeof body.role === "string") patch.role = body.role;
    if (typeof body.department === "string") patch.department = body.department;
    if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
    if (id === a.user.id && (patch.disabled || (patch.role && patch.role !== "admin"))) {
      return Response.json({ error: "You cannot switch off or demote your own account." }, { status: 400 });
    }
    if (Object.keys(patch).length) {
      updateUser(id, patch);
      logEvent(a.user, "user_updated", `${target.username}: ${JSON.stringify(patch)}`);
    }
    return Response.json({ user: getUserById(id) });
  } catch (e) {
    return fail(e);
  }
}
