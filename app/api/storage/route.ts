import { getSessionUser } from "@/lib/auth";
import { kvDelete, kvGet, kvSet } from "@/lib/kv";

// Key-value storage for the logged-in user's chat threads and messages.
// Every call is scoped to the user in the login cookie, never to a user id sent by the browser.

const MAX_VALUE_BYTES = 5 * 1024 * 1024;
// Keys are chosen by the chat library, e.g. plpa:formatted-messages:["<id>","<format>"].
// They are only ever used as SQL parameters, so any printable ASCII is fine.
const KEY_OK = /^plpa:[\x20-\x7E]{1,290}$/;

const unauthorized = () => Response.json({ error: "Please sign in." }, { status: 401 });
const badKey = () => Response.json({ error: "Invalid key." }, { status: 400 });

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!KEY_OK.test(key)) return badKey();
  return Response.json({ value: kvGet(user.id, key) });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";
  const value = typeof body?.value === "string" ? body.value : null;
  if (!KEY_OK.test(key) || value === null) return badKey();
  if (Buffer.byteLength(value) > MAX_VALUE_BYTES) {
    return Response.json({ error: "Too large." }, { status: 413 });
  }
  kvSet(user.id, key, value);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!KEY_OK.test(key)) return badKey();
  kvDelete(user.id, key);
  return Response.json({ ok: true });
}
