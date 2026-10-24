import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Admin only: the accounts that exist (no password data).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });

  const users = getDb()
    .prepare("SELECT id, username, name, department, role, created_at AS createdAt FROM users ORDER BY id")
    .all();
  return Response.json({ users });
}
