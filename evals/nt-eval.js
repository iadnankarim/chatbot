// Near-topic questions: the topic exists in the documents but the asked fact does not.
// Every one of these should be answered "not found".
const B = process.env.BASE_URL ?? "http://localhost:3000";
const Q = [
  "What is the fee for passport renewal?",
  "What is the fee for a CNIC for overseas Pakistanis?",
  "How many days of study leave are allowed?",
  "What is the penalty for losing a CNIC three times?",
  "Who is the Regional Director of Lahore?",
  "How long does it take to receive a B-Form?",
  "عمرہ کی چھٹی کتنے دن کی ہوتی ہے؟",
  "بیرون ملک پاکستانیوں کے لیے شناختی کارڈ کی فیس کتنی ہے؟",
];
const notFoundRe = /not found|معلومات نہیں ملیں/i;

(async () => {
  const login = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: "Plpa@2026" }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  let ok = 0;
  for (const q of Q) {
    const t0 = Date.now();
    const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ kb: true, messages: [{ id: "1", role: "user", parts: [{ type: "text", text: q }] }] }) });
    let reply = "";
    for (const line of (await res.text()).split("\n")) { if (!line.startsWith("data: {")) continue; const m = JSON.parse(line.slice(6)); if (m.type === "text-delta") reply += m.delta; }
    const pass = notFoundRe.test(reply) && !reply.includes("Sources") && !reply.includes("ماخذ");
    if (pass) ok++;
    console.log(`${pass ? "PASS" : "FAIL"} [${((Date.now() - t0) / 1000).toFixed(1)}s] ${q}\n      -> ${reply.replace(/\n+/g, " ").slice(0, 150)}`);
  }
  console.log(`\nnear-topic questions correctly "not found": ${ok}/${Q.length}`);
})();
