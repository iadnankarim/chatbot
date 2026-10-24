// Everyday office tasks in General mode (no documents). Prints each answer to read by eye.
// Usage: BASE_URL=http://localhost:3000 node evals/daily-tasks.js
const B = process.env.BASE_URL || "http://localhost:3000";
const TASKS = [
  ["Meeting minutes", "Make minutes with action points and who is responsible from these notes: Ahmed will send the budget by Friday. Sara to book the hall for Monday. We agreed the training starts 1 March. Bilal to inform all staff."],
  ["Reply to a letter", "Write a professional reply to this letter: 'Dear Sir, kindly confirm if our trucks can cross the border on Sunday as the consignment is urgent. Regards, Khan Traders.'"],
  ["Fix tone (English)", "Make this more formal and correct the grammar: 'pls send me the report asap, we is waiting since long'"],
  ["Fix tone (Urdu)", "اس جملے کو سرکاری انداز میں درست کریں: 'مجھے کل چھٹی چاہیے کیونکہ میری طبیعت خراب ہے'"],
  ["Short summary", "Summarize in 5 bullet points: The authority has decided to introduce a digital token system at all land ports to reduce waiting time for trucks. The system will be tested at one port for three months. Drivers will register online, receive a time slot, and the gate staff will verify the token. Complaints will be handled by a helpdesk. A report will go to the board after the pilot."],
  ["Draft notice", "Draft a notice for all staff: office will be closed on 14 August for Independence Day."],
  ["Compare", "Compare these two: Option A: buy 10 laptops for 2.5 million, 3-year warranty. Option B: lease 10 laptops for 60,000 per month, includes support. Which is better for 2 years?"],
];
(async () => {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: process.env.DEMO_PASSWORD || "Plpa@2026" }) });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  for (const [name, text] of TASKS) {
    const t0 = Date.now();
    const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text }] }] }) });
    const raw = await res.text();
    const out = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => { try { const j = JSON.parse(l.slice(5)); return j.type === "text-delta" ? j.delta : ""; } catch { return ""; } }).join("");
    console.log(`\n=== ${name} (${Math.round((Date.now() - t0) / 1000)}s)\n${out.trim()}`);
  }
})();
