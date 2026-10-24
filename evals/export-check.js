// Word export: sends an English + Urdu answer to /api/export and checks the .docx contents.
// Usage: BASE_URL=http://localhost:3000 node evals/export-check.js
const B = process.env.BASE_URL || "http://localhost:3000";
(async () => {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: process.env.DEMO_PASSWORD || "Plpa@2026" }) });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  const text = "## Notice\n\n**To all staff:** the office is closed on 14 August.\n\n* Bring your card\n* Use the main gate\n\nمحترم عملہ، دفتر 14 اگست کو بند رہے گا۔";
  const none = await fetch(B + "/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  console.log("without login:", none.status, "(expected 401)");
  const res = await fetch(B + "/api/export", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ text }) });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("with login:", res.status, res.headers.get("content-type"), buf.length, "bytes, starts with PK:", buf.slice(0, 2).toString() === "PK");
  require("fs").writeFileSync(require("path").join(process.env.TEMP || ".", "plpa-export-check.docx"), buf);
  const empty = await fetch(B + "/api/export", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ text: " " }) });
  console.log("empty text:", empty.status, "(expected 400)");
})();
