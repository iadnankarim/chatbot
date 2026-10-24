// Two attached files + "compare": checks the answer names both and a third file is refused.
// Usage: BASE_URL=http://localhost:3000 node evals/compare-eval.js
const fs = require("fs"), path = require("path");
const B = process.env.BASE_URL || "http://localhost:3000";
const DOCS = process.env.DOCS_DIR || path.join(__dirname, "..", "..", "sample-docs");
const file = (n) => ({ type: "file", mediaType: "application/octet-stream", filename: n, url: "data:application/octet-stream;base64," + fs.readFileSync(path.join(DOCS, n)).toString("base64") });
const text = (t) => ({ type: "text", text: t });
async function ask(cookie, parts) {
  const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: [{ id: "1", role: "user", parts }] }) });
  const raw = await res.text();
  return raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => { try { const j = JSON.parse(l.slice(5)); return j.type === "text-delta" ? j.delta : j.type === "error" ? j.errorText : ""; } catch { return ""; } }).join("").trim();
}
(async () => {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: process.env.DEMO_PASSWORD || "Plpa@2026" }) });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  const a = "NADRA_Fee_Schedule_EN.pdf", b = "NADRA_Employee_Leave_Policy_EN.pdf";
  const out = await ask(cookie, [file(a), file(b), text("Compare these two documents. What is each about and how do they differ?")]);
  console.log("=== compare\n" + out);
  const three = await ask(cookie, [file(a), file(b), file("NADRA_Complaint_Handling_SOP_EN.pdf"), text("Compare")]);
  console.log("\n=== three files\n" + three);
})();
