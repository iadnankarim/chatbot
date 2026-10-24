// Urdu general-chat answers: how many contain letters of another script?
const B = process.env.BASE_URL ?? "http://localhost:3000";
const prompts = [
  "فوٹو سنتھیسس کیا ہے؟ ایک جملے میں بتائیں۔",
  "بارش کیسے ہوتی ہے؟ مختصر جواب دیں۔",
  "کمپیوٹر کا پاس ورڈ مضبوط کیسے بنایا جائے؟ دو نکات بتائیں۔",
  "پانی کے فوائد بتائیں۔ مختصر۔",
  "ای میل لکھتے وقت کن باتوں کا خیال رکھنا چاہیے؟",
  "زمین سورج کے گرد کیسے گھومتی ہے؟",
  "وقت کی پابندی کیوں ضروری ہے؟",
  "انٹرنیٹ کیا ہے؟ ایک جملے میں بتائیں۔",
  "چھٹی کی درخواست کا ایک مختصر رسمی خط لکھیں",
  "اچھی میٹنگ کے لیے پانچ مفید نکات بتائیں",
];
const bad = /[Ѐ-ԯऀ-෿฀-໿぀-ヿ一-鿿가-힯]/g;

(async () => {
  const login = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: "Plpa@2026" }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  let leaky = 0, empty = 0;
  for (const text of prompts) {
    const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text }] }] }) });
    let reply = "";
    for (const line of (await res.text()).split("\n")) { if (!line.startsWith("data: {")) continue; const m = JSON.parse(line.slice(6)); if (m.type === "text-delta") reply += m.delta; }
    const n = (reply.match(bad) || []).length; if (n) leaky++; if (!reply.trim()) empty++;
    console.log(`${res.status} ${n ? "LEAK(" + n + ")" : "clean   "} | ${reply.replace(/\n+/g, " ").slice(0, 110)}`);
  }
  console.log(`\nreplies with foreign-script letters: ${leaky}/${prompts.length}   |   empty replies: ${empty}`);
})();
