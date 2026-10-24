import { BRAND } from "@/lib/brand";
import { toBlocks, toRuns } from "@/lib/markdown-lite";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const runs = (t: string) => toRuns(t).map((r) => (r.bold ? `<b>${esc(r.text)}</b>` : esc(r.text))).join("");

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Downloads the answer as a Word file (made by /api/export). */
export async function downloadWord(text: string) {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Could not create the Word file.");
  save(await res.blob(), "plpa-answer.docx");
}

/** Opens the print dialog with a clean page: choose "Save as PDF" there. Works offline. */
export function printPdf(text: string) {
  const body = toBlocks(text)
    .map((b) =>
      b.kind === "heading"
        ? `<h2 dir="auto">${runs(b.text)}</h2>`
        : b.kind === "bullet"
          ? `<li dir="auto">${runs(b.text)}</li>`
          : `<p dir="auto">${runs(b.text)}</p>`,
    )
    .join("")
    .replace(/(<li[\s\S]*?<\/li>)+/g, (m) => `<ul>${m}</ul>`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(BRAND.name)}</title>
<style>body{font-family:Arial,"Noto Nastaliq Urdu",sans-serif;font-size:13pt;line-height:1.7;margin:24mm}
h1{font-size:12pt;border-bottom:1px solid #999;padding-bottom:4px}h2{font-size:15pt}
footer{margin-top:24px;font-size:9pt;color:#666}</style></head>
<body><h1>${esc(BRAND.name)}</h1>${body}<footer>Created by an AI assistant. Please verify before use.</footer></body></html>`;

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return frame.remove();
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  }, 300);
}
