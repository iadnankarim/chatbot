const B = process.env.BASE_URL ?? "http://localhost:3000";
// [question, expected answer substrings (any), expected page(s), answerable]
const Q = [
  ["What is the penalty for running a land port operation without a licence?", ["three years", "3 years"], [19], true],
  ["Who is the chairperson of the Pakistan Land Port Authority?", ["Managing Director"], [8], true],
  ["For how many years is the Authority exempt from income tax?", ["five years", "5 years"], [27, 28], true],
  ["How often does the Management Board meet?", ["once every week", "every week", "weekly"], [16], true],
  ["When does the Pakistan Land Port Authority Act come into force?", ["at once", "immediately"], [2], true],
  ["What is the quorum for a meeting of the Authority?", ["majority"], [8], true],
  ["پاکستان لینڈ پورٹ اتھارٹی کا چیئرپرسن کون ہوتا ہے؟", ["منیجنگ ڈائریکٹر", "Managing Director", "مینیجنگ ڈائریکٹر"], [8], true],
  ["لائسنس کے بغیر لینڈ پورٹ کی سرگرمیاں کرنے کی سزا کیا ہے؟", ["تین سال", "3 سال", "۳ سال"], [19], true],
  ["Who is the current Managing Director of PLPA?", null, null, false],
  ["Where is the head office of the Authority?", ["Islamabad"], [4, 5], true],
  ["اتھارٹی کو انکم ٹیکس سے کتنے سال کی چھوٹ ملتی ہے؟", ["پانچ", "5", "۵"], [27, 28], true],
  ["مینجمنٹ بورڈ کتنی بار اجلاس کرتا ہے؟", ["ہفتہ", "ہفتے", "week"], [16, 17], true],
  ["What is the salary of the Managing Director?", null, null, false],
  ["How many land ports are operated by PLPA?", null, null, false],
];
const notFoundRe = /not found|معلومات نہیں ملیں/i;
(async () => {
  const login = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: "Plpa@2026" }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  let okIn = 0, okOut = 0, nIn = 0, nOut = 0;
  for (const [q, expect, pages, answerable] of Q) {
    const t0 = Date.now();
    const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ kb: true, messages: [{ id: "1", role: "user", parts: [{ type: "text", text: q }] }] }) });
    let reply = ""; for (const l of (await res.text()).split("\n")) { if (l.startsWith("data: {")) { const m = JSON.parse(l.slice(6)); if (m.type === "text-delta") reply += m.delta; } }
    const [ans, src = ""] = reply.split("\n\n---\n");
    let v;
    if (answerable) { nIn++;
      const a = expect.some((e) => ans.toLowerCase().includes(e.toLowerCase()));
      const pg = [...src.matchAll(/(?:pages?|صفحہ|صفحات)\s+(\d+)(?:–(\d+))?/g)].flatMap((m) => { const a = Number(m[1]), b = m[2] ? Number(m[2]) : a; return Array.from({ length: b - a + 1 }, (_, i) => a + i); });
      const s = src.includes("PLPA_Bill"); // page numbers differ from the Gazette, shown for reading
      const nf = notFoundRe.test(ans);
      if (a && s && !nf) okIn++;
      v = a && s && !nf ? "PASS" : `FAIL(answer:${a} source:${s} pages:${pg.join(",") || "-"} notfound:${nf})`;
    } else { nOut++; const ok = notFoundRe.test(ans) && !src; if (ok) okOut++; v = ok ? "PASS" : "FAIL(should be not found)"; }
    console.log(`${v} [${((Date.now() - t0) / 1000).toFixed(1)}s] ${q}\n    A: ${ans.replace(/\n/g, " ").slice(0, 170)}${src ? "\n    S: " + src.replace(/\n/g, " ").replace("**", "").slice(0, 100) : ""}`);
  }
  console.log(`\nanswerable correct: ${okIn}/${nIn}   |   not-in-docs correctly "not found": ${okOut}/${nOut}`);
})();
