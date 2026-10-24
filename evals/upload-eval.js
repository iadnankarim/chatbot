// Sends attachments straight to /api/chat (as the browser does) and prints the replies.
const fs = require("fs");
const B = process.env.BASE_URL ?? "http://localhost:3000";
const docs = (process.env.DOCS_DIR ?? require("path").resolve(__dirname, "../../sample-docs")).split("\\").join("/") + "/";
const mime = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain" };

const filePart = (path, name = path.split("/").pop()) => {
  const ext = name.split(".").pop().toLowerCase();
  const data = fs.readFileSync(path).toString("base64");
  return { type: "file", mediaType: mime[ext] ?? "application/octet-stream", filename: name, url: `data:${mime[ext] ?? "application/octet-stream"};base64,${data}` };
};

const cases = [
  ["EN pdf, no message", [filePart(docs + "NADRA_Fee_Schedule_EN.pdf")]],
  ["EN pdf, question", [{ type: "text", text: "What is the fee for a duplicate CNIC under urgent service?" }, filePart(docs + "NADRA_Fee_Schedule_EN.pdf")]],
  ["UR pdf, no message (expect Urdu summary)", [filePart(docs + "NADRA_CNIC_Guide_UR.pdf")]],
  ["EN docx + Urdu request", [{ type: "text", text: "اس دستاویز کا خلاصہ اردو میں بتائیں" }, filePart(docs + "NADRA_Office_Timings_Notice_EN.docx")]],
  ["Long PLPA Act (28 pages) -> truncated", [{ type: "text", text: "Summarize this document." }, filePart(docs + "PLPA_Bill_2025_Passed_by_NA.pdf")]],
  ["Unsupported .txt", [filePart(docs + "test-questions.md", "notes.txt")]],
  ["Not a real PDF", [{ type: "file", mediaType: "application/pdf", filename: "broken.pdf", url: "data:application/pdf;base64," + Buffer.from("this is not a pdf").toString("base64") }]],
];
cases.push(["EN docx + English request", [{ type: "text", text: "Summarize this document." }, filePart(docs + "NADRA_Office_Timings_Notice_EN.docx")]]);
const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;

(async () => {
  const login = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: "Plpa@2026" }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  for (const [i, [label, parts]] of cases.entries()) {
    if (only && !only.includes(i + 1)) continue;
    const t0 = Date.now();
    const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: [{ id: "1", role: "user", parts }] }) });
    let reply = "", first = null;
    for (const l of (await res.text()).split("\n")) { if (l.startsWith("data: {")) { const m = JSON.parse(l.slice(6)); if (m.type === "text-delta") { first ??= ((Date.now() - t0) / 1000).toFixed(1); reply += m.delta; } } }
    const shown = reply.length > 700 ? reply.trim().slice(0, 450) + "\n  [...]\n" + reply.trim().slice(-260) : reply.trim();
    console.log(`\n#${i + 1} ${label}  [HTTP ${res.status}, total ${((Date.now() - t0) / 1000).toFixed(1)}s, first text ${first}s]\n${shown}`);
  }
})();
