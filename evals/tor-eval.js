// Questions about the real PLPA ERP Terms of Reference (a Word file: sources show the file name only).
const B = process.env.BASE_URL ?? "http://localhost:3000";
const FILE = "PLPA_ERP_Terms_of_Reference";
// [question, any of these answers, answerable]
const Q = [
  ["How many modules does the PLPA ERP platform cover?", ["21"], true],
  ["Which phase is the Legal and Litigation module in?", ["phase 2", "second phase", "month 8"], true],
  ["What is the minimum availability required for the ERP platform?", ["99.5"], true],
  ["How long is the warranty period?", ["12 months", "twelve months", "12-month"], true],
  ["In which month is the final handover of the source code?", ["month 14", "14"], true],
  ["How many completed ERP projects must the service provider have?", ["two", "2"], true],
  ["What is the maximum data loss allowed?", ["1 hour", "one hour"], true],
  ["Where will the data be hosted?", ["private cloud", "pakistan"], true],
  ["How many internal users will the platform serve?", ["500"], true],
  ["Which phase includes the Stakeholder Portal and what are its dates?", ["phase 2", "1 jul", "31 oct"], true],
  ["ای آر پی پلیٹ فارم کی وارنٹی کتنی مدت کی ہے؟", ["12", "۱۲", "بارہ"], true],
  ["ای آر پی پلیٹ فارم میں کتنے ماڈیولز ہیں؟", ["21", "۲۱", "اکیس"], true],
  ["ERP ka final handover kis month mein hai?", ["14"], true],
  ["What is the total budget for the ERP project?", null, false],
  ["Which company won the ERP contract?", null, false],
  ["Who is the service provider chosen for this project?", null, false],
  ["اس منصوبے کی کل لاگت کتنی ہے؟", null, false],
];
const notFoundRe = /not found|معلومات نہیں ملیں/i;

(async () => {
  const login = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: "Plpa@2026" }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  let okIn = 0, okOut = 0, nIn = 0, nOut = 0;
  for (const [q, expect, answerable] of Q) {
    const t0 = Date.now();
    const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ kb: true, messages: [{ id: "1", role: "user", parts: [{ type: "text", text: q }] }] }) });
    let reply = ""; for (const l of (await res.text()).split("\n")) { if (l.startsWith("data: {")) { const m = JSON.parse(l.slice(6)); if (m.type === "text-delta") reply += m.delta; } }
    const [ans, src = ""] = reply.split("\n\n---\n");
    let v;
    if (answerable) {
      nIn++;
      const a = expect.some((e) => ans.toLowerCase().includes(e.toLowerCase()));
      const s = src.includes(FILE);
      const nf = notFoundRe.test(ans);
      if (a && s && !nf) okIn++;
      v = a && s && !nf ? "PASS" : `FAIL(answer:${a} source:${s} notfound:${nf})`;
    } else {
      nOut++;
      const ok = notFoundRe.test(ans) && !src;
      if (ok) okOut++;
      v = ok ? "PASS" : "FAIL(should be not found)";
    }
    console.log(`${v} [${((Date.now() - t0) / 1000).toFixed(0)}s] ${q}\n    A: ${ans.replace(/\n/g, " ").slice(0, 190)}${src ? "\n    S: " + src.replace(/\n/g, " ").replace("**", "").slice(0, 90) : ""}`);
  }
  console.log(`\nanswerable correct: ${okIn}/${nIn}   |   not-in-document correctly "not found": ${okOut}/${nOut}`);
})();
