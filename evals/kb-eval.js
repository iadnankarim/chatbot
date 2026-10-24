// Runs the 16 test questions through /api/chat in Knowledge Base mode and grades them.
const B = process.env.BASE_URL ?? "http://localhost:3000";
const MODE = process.argv[2] === "general" ? false : true;
const Q = [
  [1, "What is the fee for a new CNIC under urgent service?", ["1,500"], "Fee_Schedule", 1],
  [2, "How many days of annual leave does an employee get?", ["30"], "Leave_Policy", 1],
  [3, "Within how many days can an applicant appeal a CNIC rejection?", ["30"], "CNIC_Application_Guide", 4],
  [4, "What are the office timings on Saturday?", ["9:00", "1:00"], "Office_Timings", null],
  [5, "How long does a complaint's Level 1 resolution take?", ["5"], "Complaint", 2],
  [6, "Senior citizens ko kitna discount milta hai?", ["50"], "Fee_Schedule", 1],
  [7, "شناختی کارڈ کی میعاد کتنی ہوتی ہے؟", ["10"], "CNIC_Guide_UR", 3],
  [8, "پاس ورڈ کتنے دن بعد تبدیل کرنا ہوگا؟", ["90"], "Privacy_Policy_UR", 2],
  [9, "بائیومیٹرک تصدیق میں کتنا وقت لگتا ہے؟", ["2", "۲", "دو"], "Biometric", null],
  [10, "Maternity leave kitni hoti hai?", ["90"], "Leave_Policy", 1],
  [11, "ایگزیکٹو سروس میں کارڈ کتنے دن میں ملتا ہے؟", ["3", "۳", "تین"], "CNIC", 3],
  [12, "What is the data breach reporting deadline?", ["24"], "Privacy_Policy_UR", 2],
  [13, "What is the passport renewal fee?", null],
  [14, "Pakistan ka cricket match score kya hai?", null],
  [15, "PLPA ke chairman ka naam kya hai?", null],
  [16, "ڈرائیونگ لائسنس بنوانے کا طریقہ کیا ہے؟", null],
];
const notFoundRe = /not found|معلومات نہیں ملیں/i;

(async () => {
  const login = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: "Plpa@2026" }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  let okIn = 0, okOut = 0;
  for (const [id, q, expect, file, page] of Q) {
    const t0 = Date.now();
    const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ kb: MODE, messages: [{ id: "1", role: "user", parts: [{ type: "text", text: q }] }] }) });
    let reply = ""; let first = null;
    for (const line of (await res.text()).split("\n")) { if (!line.startsWith("data: {")) continue; const m = JSON.parse(line.slice(6)); if (m.type === "text-delta") { first ??= Date.now() - t0; reply += m.delta; } }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const [answerPart, sourcePart = ""] = reply.split("\n\n---\n");
    let verdict;
    if (expect) {
      const hasAnswer = expect.some((e) => answerPart.includes(e));
      const covered = [...sourcePart.matchAll(/(?:pages?|صفحہ|صفحات)\s+(\d+)(?:–(\d+))?/g)].flatMap((m) => { const a = Number(m[1]), b = m[2] ? Number(m[2]) : a; return Array.from({ length: b - a + 1 }, (_, i) => a + i); });
      const hasSource = sourcePart.includes(file) && (page === null || covered.includes(page));
      const correct = !notFoundRe.test(answerPart) && hasAnswer && hasSource;
      if (correct) okIn++;
      verdict = correct ? "PASS" : `FAIL(answer:${hasAnswer} source:${!!hasSource} nf:${notFoundRe.test(answerPart)})`;
    } else {
      const correct = notFoundRe.test(answerPart) && !sourcePart;
      if (correct) okOut++;
      verdict = correct ? "PASS" : "FAIL (should be not-found)";
    }
    console.log(`#${id} ${verdict} [${secs}s]\n   Q: ${q}\n   A: ${answerPart.replace(/\n/g, " ").slice(0, 160)}${sourcePart ? "\n   S: " + sourcePart.replace(/\n/g, " ").replace("**", "").slice(0, 120) : ""}`);
  }
  console.log(`\nanswerable correct (answer + source + page): ${okIn}/12   |   not-in-docs correctly "not found": ${okOut}/4`);
})();
