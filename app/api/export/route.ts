import { AlignmentType, Document, Footer, Header, Packer, Paragraph, TextRun } from "docx";
import { getSessionUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { toBlocks, toRuns } from "@/lib/markdown-lite";

const ARABIC = /[؀-ۿ]/;
const MAX_CHARS = 60_000;

// Turns an answer into a Word (.docx) file.  POST { text }
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.slice(0, MAX_CHARS) : "";
  if (!text.trim()) return Response.json({ error: "Nothing to export." }, { status: 400 });

  const paragraph = (t: string, opts: { bold?: boolean; size?: number; bullet?: boolean } = {}) => {
    const rtl = ARABIC.test(t);
    return new Paragraph({
      bidirectional: rtl,
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      bullet: opts.bullet ? { level: 0 } : undefined,
      spacing: { after: 120 },
      children: toRuns(t).map(
        (r) =>
          new TextRun({
            text: r.text,
            bold: r.bold || opts.bold,
            size: opts.size ?? 24,
            font: "Arial",
            rightToLeft: rtl,
          }),
      ),
    });
  };

  const doc = new Document({
    creator: BRAND.name,
    title: BRAND.name,
    sections: [
      {
        headers: {
          default: new Header({
            children: [new Paragraph({ children: [new TextRun({ text: BRAND.name, bold: true, size: 20, font: "Arial" })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Created by an AI assistant. Please verify before use.", size: 16, color: "666666", font: "Arial" }),
                ],
              }),
            ],
          }),
        },
        children: toBlocks(text).map((b) =>
          b.kind === "heading"
            ? paragraph(b.text, { bold: true, size: 28 })
            : paragraph(b.text, { bullet: b.kind === "bullet" }),
        ),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": 'attachment; filename="plpa-answer.docx"',
    },
  });
}
