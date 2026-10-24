// Scores the 16 test questions against the Knowledge Base (admin search endpoint).
const B = process.env.BASE_URL ?? "http://localhost:3000";
const questions = [
  // [id, question, expected file substring, expected page, answerable]
  [1, "What is the fee for a new CNIC under urgent service?", "Fee_Schedule", 1, true],
  [2, "How many days of annual leave does an employee get?", "Leave_Policy", 1, true],
  [3, "Within how many days can an applicant appeal a CNIC rejection?", "CNIC_Application_Guide", 4, true],
  [4, "What are the office timings on Saturday?", "Office_Timings", null, true],
  [5, "How long does a complaint's Level 1 resolution take?", "Complaint", 2, true],
  [6, "Senior citizens ko kitna discount milta hai?", "Fee_Schedule", 2, true],
  [7, "شناختی کارڈ کی میعاد کتنی ہوتی ہے؟", "CNIC_Guide_UR", 3, true],
  [8, "پاس ورڈ کتنے دن بعد تبدیل کرنا ہوگا؟", "Privacy_Policy_UR", 2, true],
  [9, "بائیومیٹرک تصدیق میں کتنا وقت لگتا ہے؟", "Biometric", null, true],
  [10, "Maternity leave kitni hoti hai?", "Leave_Policy", 1, true],
  [11, "ایگزیکٹو سروس میں کارڈ کتنے دن میں ملتا ہے؟", "CNIC", 3, true],
  [12, "What is the data breach reporting deadline?", "Privacy_Policy_UR", 2, true],
  [13, "What is the passport renewal fee?", "-", 0, false],
  [14, "Pakistan ka cricket match score kya hai?", "-", 0, false],
  [15, "PLPA ke chairman ka naam kya hai?", "-", 0, false],
  [16, "ڈرائیونگ لائسنس بنوانے کا طریقہ کیا ہے؟", "-", 0, false],
];

(async () => {
  const login = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "Plpa@2026" }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const rows = [];
  for (const [id, q, file, page, answerable] of questions) {
    const r = await (await fetch(`${B}/api/kb/search?k=3&q=${encodeURIComponent(q)}`, { headers: { cookie } })).json();
    const top = r.hits[0];
    const fileOk = answerable && top.file.includes(file);
    const pageOk = !page || top.page === page;
    rows.push({ id, answerable, top: top.score, second: r.hits[1]?.score, fileOk, pageOk, got: `${top.file.replace(/\.(pdf|docx)$/, "")} p${top.page}`, q: q.slice(0, 38) });
    console.log(`${String(id).padStart(2)} ${answerable ? "IN " : "OUT"} top=${top.score.toFixed(3)} 2nd=${(r.hits[1]?.score ?? 0).toFixed(3)} ${answerable ? (fileOk && pageOk ? "OK  " : fileOk ? "page?" : "WRONG") : "     "} -> ${top.file.slice(0, 34)} p${top.page}  | ${q.slice(0, 40)}`);
  }
  const inScores = rows.filter((r) => r.answerable).map((r) => r.top), outScores = rows.filter((r) => !r.answerable).map((r) => r.top);
  console.log(`\nanswerable: min=${Math.min(...inScores).toFixed(3)} max=${Math.max(...inScores).toFixed(3)}`);
  console.log(`not in docs: min=${Math.min(...outScores).toFixed(3)} max=${Math.max(...outScores).toFixed(3)}`);
  console.log(`right file+page for answerable: ${rows.filter((r) => r.answerable && r.fileOk && r.pageOk).length}/12`);
})();
