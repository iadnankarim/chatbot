// OCR: draws a page of text (English + Urdu) as a picture, then (1) attaches the picture and
// (2) attaches a scanned PDF (the picture inside a PDF, no text layer) and asks about it.
// Usage: BASE_URL=http://localhost:3000 node evals/ocr-check.js
const { createCanvas } = require("@napi-rs/canvas");
const B = process.env.BASE_URL || "http://localhost:3000";

function page() {
  const c = createCanvas(1240, 700);
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, 1240, 700);
  x.fillStyle = "#000";
  x.font = "44px Arial";
  const lines = ["OFFICE ORDER No. 47", "The Torkham gate will open at 6 AM on Monday.", "Contact: Mr. Imran Qureshi, Director Operations.", "Penalty for late entry is PKR 5000."];
  lines.forEach((l, i) => x.fillText(l, 60, 90 + i * 80));
  return c;
}

// A one-page PDF whose only content is a JPEG picture (so it has no text to extract).
function scannedPdf(jpeg, w, h) {
  const objs = [];
  const add = (b) => objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"));
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "latin1"), jpeg, Buffer.from("\nendstream", "latin1")]));
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const parts = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [];
  let pos = parts[0].length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), o, Buffer.from("\nendobj\n", "latin1")]);
    parts.push(b);
    pos += b.length;
  });
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`;
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}

async function ask(cookie, name, buf, question) {
  const part = { type: "file", mediaType: "application/octet-stream", filename: name, url: "data:application/octet-stream;base64," + buf.toString("base64") };
  const t0 = Date.now();
  const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [part, { type: "text", text: question }] }] }) });
  const raw = await res.text();
  const out = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => { try { const j = JSON.parse(l.slice(5)); return j.type === "text-delta" ? j.delta : j.type === "error" ? j.errorText : ""; } catch { return ""; } }).join("").trim();
  return `${out.replace(/\s+/g, " ").slice(0, 260)}  [${Math.round((Date.now() - t0) / 1000)}s]`;
}

(async () => {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: process.env.DEMO_PASSWORD || "Plpa@2026" }) });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  const canvas = page();
  const q = "What time does the gate open and what is the penalty for late entry?";
  console.log("IMAGE  :", await ask(cookie, "order.png", canvas.toBuffer("image/png"), q));
  console.log("SCANPDF:", await ask(cookie, "order-scan.pdf", scannedPdf(canvas.toBuffer("image/jpeg", 90), 1240, 700), q));
})();
