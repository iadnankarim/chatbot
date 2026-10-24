// Excel and PowerPoint attachments: builds a small .xlsx and .pptx, attaches each to a chat
// question and checks the answer uses the file's facts.
// Usage: BASE_URL=http://localhost:3000 node evals/office-formats-check.js
const JSZip = require("jszip");
const B = process.env.BASE_URL || "http://localhost:3000";

async function makeXlsx() {
  const z = new JSZip();
  z.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  z.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  z.file("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>');
  z.file("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  const cell = (r, c, v) => `<c r="${"AB"[c]}${r}"${typeof v === "number" ? "" : ' t="inlineStr"'}>${typeof v === "number" ? `<v>${v}</v>` : `<is><t>${v}</t></is>`}</c>`;
  const rows = [["Department", "Budget (PKR)"], ["Security", 4500000], ["Customs Liaison", 2750000], ["IT", 6100000]];
  z.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cell(i + 1, c, v)).join("")}</row>`).join("")}</sheetData></worksheet>`);
  return z.generateAsync({ type: "nodebuffer" });
}

async function makePptx() {
  const z = new JSZip();
  z.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  const slide = (lines) => `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${lines.map((l) => `<p:sp><p:txBody><a:p><a:r><a:t>${l}</a:t></a:r></a:p></p:txBody></p:sp>`).join("")}</p:spTree></p:cSld></p:sld>`;
  z.file("ppt/slides/slide1.xml", slide(["Digital Token System", "Pilot at Torkham for three months"]));
  z.file("ppt/slides/slide2.xml", slide(["Next steps", "Board review on 15 March", "Owner: Director Operations"]));
  return z.generateAsync({ type: "nodebuffer" });
}

async function ask(cookie, name, buf, question) {
  const part = { type: "file", mediaType: "application/octet-stream", filename: name, url: "data:application/octet-stream;base64," + buf.toString("base64") };
  const res = await fetch(B + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [part, { type: "text", text: question }] }] }) });
  const raw = await res.text();
  return raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => { try { const j = JSON.parse(l.slice(5)); return j.type === "text-delta" ? j.delta : j.type === "error" ? j.errorText : ""; } catch { return ""; } }).join("").trim();
}

(async () => {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ahmed", password: process.env.DEMO_PASSWORD || "Plpa@2026" }) });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  const checks = [
    ["budget.xlsx", await makeXlsx(), "Which department has the highest budget and how much?", /IT/i, /6[, ]?100[, ]?000|6\.1/],
    ["plan.pptx", await makePptx(), "When is the board review and who is the owner?", /15(th)? March/i, /Director Operations/i],
  ];
  let failed = 0;
  for (const [name, buf, q, a, b] of checks) {
    const out = await ask(cookie, name, buf, q);
    const ok = a.test(out) && b.test(out);
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${out.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  process.exit(failed ? 1 : 0);
})();
