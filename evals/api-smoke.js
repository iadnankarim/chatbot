// Fast safety check (about 10 seconds, no model needed): login, per-user isolation of saved chats,
// admin-only endpoints, upload validation. Run:  BASE_URL=http://localhost:3000 node evals/api-smoke.js
const B = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Plpa@2026";
let passed = 0, failed = 0;

const check = (name, ok, detail = "") => {
  ok ? passed++ : failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   <- " + detail}`);
};

const login = async (username, password = PASSWORD) => {
  const res = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  return { res, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
};
const call = (path, cookie, init = {}) => fetch(B + path, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) } });

(async () => {
  // --- login
  const bad = await login("ahmed", "wrong-password");
  check("wrong password is rejected (401)", bad.res.status === 401, bad.res.status);
  const unknown = await login("nobody-here", "x");
  check("unknown user gets the same answer (401)", unknown.res.status === 401, unknown.res.status);
  const ahmed = await login("ahmed");
  check("correct login works (200) and sets a cookie", ahmed.res.status === 200 && ahmed.cookie.includes("plpa_session"), ahmed.res.status);
  const sara = await login("sara");
  const admin = await login("admin");

  // --- everything needs a login
  for (const [path, init] of [["/api/auth/me", {}], ["/api/storage?key=plpa:x", {}], ["/api/kb/documents", {}], ["/api/admin/users", {}], ["/api/admin/audit", {}]]) {
    const r = await call(path, null, init);
    check(`${path} without login is refused (401)`, r.status === 401, r.status);
  }
  const chatNoLogin = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [] }) });
  check("/api/chat without login is refused (401)", chatNoLogin.status === 401, chatNoLogin.status);
  const tampered = await call("/api/auth/me", "plpa_session=abc.def.ghi");
  check("a forged login cookie is refused (401)", tampered.status === 401, tampered.status);

  // --- saved chats belong to one user
  const key = "plpa:smoke:" + Date.now();
  const put = await call("/api/storage", ahmed.cookie, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value: "only ahmed" }) });
  check("ahmed can save a value", put.status === 200, put.status);
  const own = await (await call(`/api/storage?key=${encodeURIComponent(key)}`, ahmed.cookie)).json();
  check("ahmed reads it back", own.value === "only ahmed", JSON.stringify(own));
  const other = await (await call(`/api/storage?key=${encodeURIComponent(key)}`, sara.cookie)).json();
  check("sara does NOT see ahmed's value", other.value === null, JSON.stringify(other));
  const badKey = await call("/api/storage?key=../etc/passwd", ahmed.cookie);
  check("a key that does not start with plpa: is refused (400)", badKey.status === 400, badKey.status);
  await call(`/api/storage?key=${encodeURIComponent(key)}`, ahmed.cookie, { method: "DELETE" });

  // --- admin only
  for (const [path, init] of [["/api/admin/users", {}], ["/api/admin/audit", {}], ["/api/kb/documents", {}], ["/api/kb/reindex", { method: "POST" }], ["/api/kb/search?q=test", {}], ["/api/kb/documents?id=1", { method: "DELETE" }]]) {
    const r = await call(path, ahmed.cookie, init);
    check(`${init.method ?? "GET"} ${path.split("?")[0]} as a normal user is refused (403)`, r.status === 403, r.status);
  }
  const users = await call("/api/admin/users", admin.cookie);
  const list = users.ok ? (await users.json()).users : [];
  check("admin can list users, and no password data is returned", list.length >= 4 && !JSON.stringify(list).includes("password"), users.status);

  // --- user management and activity (admin only)
  const act = await call("/api/admin/activity", ahmed.cookie);
  check("activity as a normal user is refused (403)", act.status === 403, act.status);
  const actAdmin = await call("/api/admin/activity", admin.cookie);
  const actData = actAdmin.ok ? await actAdmin.json() : {};
  check("admin gets usage figures", typeof actData.stats?.users === "number" && Array.isArray(actData.activity), actAdmin.status);
  const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const uname = "smoke" + String(Date.now()).slice(-6);
  const mk = (b) => call("/api/admin/users", admin.cookie, json("POST", b));
  check("a normal user cannot create accounts (403)", (await call("/api/admin/users", ahmed.cookie, json("POST", { username: uname, name: "Smoke Test", department: "IT", role: "user", password: "Smoke-pass-1" }))).status === 403);
  check("a short password is refused (400)", (await mk({ username: uname, name: "Smoke Test", department: "IT", role: "user", password: "short" })).status === 400);
  check("a bad username is refused (400)", (await mk({ username: "A B", name: "Smoke Test", department: "IT", role: "user", password: "Smoke-pass-1" })).status === 400);
  const made = await mk({ username: uname, name: "Smoke Test", department: "IT", role: "user", password: "Smoke-pass-1" });
  const madeUser = made.ok ? (await made.json()).user : null;
  check("admin creates an account", !!madeUser, made.status);
  check("a duplicate username is refused (400)", (await mk({ username: uname, name: "Smoke Test", department: "IT", role: "user", password: "Smoke-pass-1" })).status === 400);
  const tryLogin = (password) => fetch(B + "/api/auth/login", json("POST", { username: uname, password }));
  const first = await tryLogin("Smoke-pass-1");
  const newCookie = (first.headers.get("set-cookie") ?? "").split(";")[0];
  check("the new account can sign in", first.ok && !!newCookie, first.status);
  const pw = await call("/api/auth/password", newCookie, json("POST", { current: "wrong-one", next: "Another-pass-2" }));
  check("changing password with a wrong current password is refused (400)", pw.status === 400, pw.status);
  const pw2 = await call("/api/auth/password", newCookie, json("POST", { current: "Smoke-pass-1", next: "Another-pass-2" }));
  check("the user changes their own password", pw2.ok, pw2.status);
  check("the old password no longer works (401)", (await tryLogin("Smoke-pass-1")).status === 401);
  const reset = await call("/api/admin/users", admin.cookie, json("PATCH", { id: madeUser?.id, password: "Reset-pass-3" }));
  check("admin resets the password", reset.ok, reset.status);
  check("the reset password works", (await tryLogin("Reset-pass-3")).ok);
  const off = await call("/api/admin/users", admin.cookie, json("PATCH", { id: madeUser?.id, disabled: true }));
  check("admin switches the account off", off.ok, off.status);
  check("a switched-off account cannot sign in (403)", (await tryLogin("Reset-pass-3")).status === 403);
  check("an already-open session of a switched-off account is refused (401)", (await call("/api/auth/me", newCookie)).status === 401);
  const self = await call("/api/admin/users", admin.cookie, json("PATCH", { id: (await (await call("/api/auth/me", admin.cookie)).json()).user.id, disabled: true }));
  check("admin cannot switch off their own account (400)", self.status === 400, self.status);
  const log = await (await call("/api/admin/activity", admin.cookie)).json();
  check("the activity log shows the new account and the password reset", log.activity.some((e) => e.action === "user_created" && e.detail.includes(uname)) && log.activity.some((e) => e.action === "password_reset"));
  // keep the account list clean for the next run: nothing can delete an account, so it stays switched off

  // --- upload validation (nothing is saved: all of these must be refused)
  const form = (name, content, dept) => { const f = new FormData(); f.set("file", new File([content], name)); if (dept !== undefined) f.set("department", dept); return f; };
  const asUser = await call("/api/kb/upload", ahmed.cookie, { method: "POST", body: form("a.docx", "x") });
  check("upload as a normal user is refused (403)", asUser.status === 403, asUser.status);
  const wrongType = await call("/api/kb/upload", admin.cookie, { method: "POST", body: form("notes.txt", "x") });
  check("upload of a .txt is refused (400)", wrongType.status === 400, wrongType.status);
  const badDept = await call("/api/kb/upload", admin.cookie, { method: "POST", body: form("a.docx", "x", "../../etc") });
  check("a department name with path tricks is refused (400)", badDept.status === 400, badDept.status);

  // --- pages
  const page = await fetch(B + "/", { redirect: "manual" });
  check("the chat page redirects to /login when logged out", page.status >= 300 && page.status < 400 && (page.headers.get("location") ?? "").includes("/login"), page.status);
  const adminPage = await fetch(B + "/admin", { headers: { cookie: ahmed.cookie }, redirect: "manual" });
  check("/admin sends a normal user back to the chat", adminPage.status >= 300 && adminPage.status < 400, adminPage.status);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("ERROR", e); process.exit(2); });
