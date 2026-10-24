import { getSessionUser } from "@/lib/auth";
import { logEvent } from "@/lib/events";

// A user marks an answer as helpful or not helpful. Only a short piece of the answer is kept.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = body?.type === "positive" ? "feedback_up" : body?.type === "negative" ? "feedback_down" : null;
  if (!type) return Response.json({ error: "Invalid feedback." }, { status: 400 });

  const answer = typeof body.answer === "string" ? body.answer.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  logEvent(user, type, answer);
  return Response.json({ ok: true });
}
