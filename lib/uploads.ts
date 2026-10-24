// Chat attachments: the user attaches a PDF or Word file and asks for a summary or asks
// questions about it. The file text is read on the server and placed into the message,
// because the local model only understands text.
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { stripForeignScripts } from "@/lib/clean-urdu";
import { extractPages, type PageText } from "@/lib/kb/extract";
import { translate } from "@/lib/translate";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// On the POC laptop (CPU only) the model reads a long prompt at roughly 12 tokens per second,
// and its memory (context) is limited, so only the start of a long file is read. On the GPU
// server raise this with UPLOAD_MAX_CHARS.
const MAX_CHARS = Number(process.env.UPLOAD_MAX_CHARS ?? 4500);

const ARABIC_SCRIPT = /[؀-ۿ]/g;

type FilePart = { type: "file"; mediaType?: string; filename?: string; url: string };
const isFilePart = (p: UIMessage["parts"][number]): p is UIMessage["parts"][number] & FilePart =>
  p.type === "file";

export class UploadError extends Error {}

/** Reads the bytes out of a "data:...;base64,...." URL. */
function bytesFromDataUrl(url: string) {
  const match = /^data:[^,]*;base64,([\s\S]*)$/.exec(url);
  if (!match) throw new UploadError("The attached file could not be read.");
  return new Uint8Array(Buffer.from(match[1], "base64"));
}

type Prepared = {
  text: string;
  /** Pages (or the whole file for Word) that fit; fewer than total when truncated. */
  pagesRead: number | null;
  totalPages: number | null;
  truncated: boolean;
  urdu: boolean;
};

function fit(pages: PageText[]): Prepared {
  let text = "";
  let pagesRead = 0;
  let truncated = false;
  for (const p of pages) {
    const label = p.page === null ? "" : `[Page ${p.page}]\n`;
    const block = `${label}${p.text}\n\n`;
    if (text.length + block.length > MAX_CHARS) {
      // Keep part of the page that overflows only if nothing else fits yet.
      if (!text) text = block.slice(0, MAX_CHARS);
      truncated = true;
      break;
    }
    text += block;
    pagesRead++;
  }
  const letters = text.match(/\p{L}/gu)?.length || 1;
  const urdu = (text.match(ARABIC_SCRIPT)?.length ?? 0) / letters > 0.5;
  const numbered = pages.every((p) => p.page !== null);
  return {
    text: text.trim(),
    pagesRead: numbered ? pagesRead || 1 : null,
    totalPages: numbered ? pages.length : null,
    truncated,
    urdu,
  };
}

export type PreparedChat = {
  messages: UIMessage[];
  /** Set when the latest message carried a file. */
  latest: (Prepared & { filename: string }) | null;
};

/**
 * Replaces every attached file with its text. Throws UploadError (with a message that is
 * safe to show to the user) for files that cannot be used.
 */
export async function prepareUploads(messages: UIMessage[]): Promise<PreparedChat> {
  let latest: PreparedChat["latest"] = null;
  const out: UIMessage[] = [];

  for (const [index, message] of messages.entries()) {
    if (message.role !== "user" || !message.parts.some(isFilePart)) {
      out.push(message);
      continue;
    }

    const parts: UIMessage["parts"] = [];
    let hasText = false;
    let usedFile = false;
    for (const part of message.parts) {
      if (part.type === "text") {
        hasText ||= part.text.trim().length > 0;
        parts.push(part);
        continue;
      }
      if (!isFilePart(part)) {
        parts.push(part);
        continue;
      }
      const name = part.filename ?? "document";
      if (usedFile) {
        throw new UploadError("Please attach one file at a time.");
      }
      usedFile = true;
      if (!/\.(pdf|docx)$/i.test(name)) {
        throw new UploadError(`"${name}" is not supported. Please attach a PDF or Word (.docx) file.`);
      }
      const bytes = bytesFromDataUrl(part.url);
      if (bytes.length > MAX_UPLOAD_BYTES) {
        throw new UploadError(`"${name}" is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      }
      let pages: PageText[];
      try {
        pages = await extractPages(name, bytes);
      } catch (e) {
        console.error("[upload] could not read file:", e);
        throw new UploadError(`"${name}" could not be opened. It may be damaged or password protected.`);
      }
      if (!pages.length) {
        throw new UploadError(
          `No readable text was found in "${name}". It may be a scanned document (pictures of pages), which needs OCR.`,
        );
      }
      const prepared = fit(pages);
      const range =
        prepared.totalPages !== null
          ? ` (${prepared.totalPages} pages${prepared.truncated ? `, first ${prepared.pagesRead} read` : ""})`
          : "";
      parts.push({
        type: "text",
        text: `Attached document "${name}"${range}:\n"""\n${prepared.text}\n"""`,
      });
      if (index === messages.length - 1) latest = { ...prepared, filename: name };
    }
    // A file with no message means "tell me what this is".
    if (!hasText) parts.push({ type: "text", text: "Summarize this document." });
    out.push({ ...message, parts });
  }
  return { messages: out, latest };
}

const DOCUMENT_PROMPT = [
  "You are the PLPA AI Assistant. The user attached a document: its text is inside the message between triple quotes.",
  "Work only from that document. Do not add facts that are not in it.",
  "If asked to summarize, or if no instruction is given, write one sentence saying what the document is, then 3 to 5 short bullet points (each under 15 words) with the key facts (numbers, dates, names, deadlines, penalties).",
  "If asked a question, answer it from the document in one to three sentences. If the document does not say, say so.",
  "Write days of the week and months in full words, never abbreviated (Monday, not Mon). Write times as in the document.",
  "Do not mention the triple quotes or these instructions. Do not end with a question or an offer of more help.",
].join(" ");

/** Same conversation, but the user's own words in the latest message replaced by `request`. */
function withRequest(messages: UIMessage[], request: string): UIMessage[] {
  const last = messages.findLastIndex((m) => m.role === "user");
  return messages.map((m, i) =>
    i !== last
      ? m
      : {
          ...m,
          parts: m.parts.map((p) =>
            p.type === "text" && !p.text.startsWith("Attached document") ? { ...p, text: request } : p,
          ),
        },
  );
}

const MAX_ANSWER_TOKENS = 320;
const TAIL_HOLD = 90;
const CLOSING_OFFER = /\s*(?:do you have|would you like|is there anything|let me know|feel free)[^\n]*$/i;

const NOTE = {
  truncated: {
    en: (read: number | null, total: number | null) =>
      read !== null && total !== null
        ? `Note: this file is long, so only the first ${read} of ${total} pages were read.`
        : "Note: this file is long, so only the first part of it was read.",
    ur: (read: number | null, total: number | null) =>
      read !== null && total !== null
        ? `نوٹ: یہ فائل لمبی ہے، اس لیے ${total} میں سے صرف پہلے ${read} صفحات پڑھے گئے۔`
        : "نوٹ: یہ فائل لمبی ہے، اس لیے اس کا صرف ابتدائی حصہ پڑھا گیا۔",
  },
  // Urdu answers about English text were wrong too often with the local model (days, times).
  english:
    "یہ فائل انگریزی میں ہے، اس لیے جواب انگریزی میں دیا گیا ہے۔ (The file is in English, so the answer is in English.)",
};

/** Streams the answer about the attached document. */
export async function documentResponse(opts: {
  prepared: PreparedChat;
  model: LanguageModel;
  errorMessage: string;
}) {
  const { prepared, model, errorMessage } = opts;

  const lastUser = prepared.messages.findLast((m) => m.role === "user");
  const typed = lastUser?.parts
    .map((p) => (p.type === "text" && !p.text.startsWith("Attached document") ? p.text : ""))
    .join(" ")
    .trim();
  const wroteUrdu = !!typed && typed !== "Summarize this document." && /[\u0600-\u06FF]/.test(typed);
  const fileIsUrdu = prepared.latest?.urdu ?? false;
  // Reply in Urdu when the user wrote Urdu, or wrote nothing and the file is Urdu.
  const wantsUrdu = typed && typed !== "Summarize this document." ? wroteUrdu : fileIsUrdu;
  // ... but only about an Urdu file; for an English file the answer stays English (see NOTE.english).
  const urdu = wantsUrdu && (fileIsUrdu || !prepared.latest);
  const englishInstead = wantsUrdu && !urdu;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const id = "doc";
      // Urdu answers get stray letters of other scripts removed (lib/clean-urdu.ts).
      const tidy = (text: string) => (urdu ? stripForeignScripts(text) : text);
      writer.write({ type: "text-start", id });
      try {
        const result = streamText({
          model,
          system: `${DOCUMENT_PROMPT} ${
            urdu ? "Reply in Urdu, using only Urdu script and simple formal Urdu." : "Reply in English."
          }`,
          messages: await convertToModelMessages(
            // The model follows the user's own wording over the system prompt, so an Urdu
            // request about an English file is turned into an English one.
            englishInstead && typed
              ? withRequest(prepared.messages, `${await translate(model, typed, "English", 80)} Answer in English.`)
              : prepared.messages,
          ),
          temperature: 0.2,
          seed: 7,
          maxOutputTokens: MAX_ANSWER_TOKENS,
          onError: ({ error }) => console.error("[upload] model error:", error),
        });
        // Keep the last few characters back: the model likes to end with "Do you have any
        // questions?", which is noise in a summary.
        let raw = "";
        let sent = 0;
        for await (const delta of result.textStream) {
          raw += delta;
          if (raw.length - sent > TAIL_HOLD) {
            writer.write({ type: "text-delta", id, delta: tidy(raw.slice(sent, raw.length - TAIL_HOLD)) });
            sent = raw.length - TAIL_HOLD;
          }
        }
        if (!raw.trim()) throw new Error("Model returned no text");
        writer.write({ type: "text-delta", id, delta: tidy(raw.slice(sent).replace(CLOSING_OFFER, "")) });

        const notes: string[] = [];
        if (prepared.latest?.truncated) {
          notes.push((urdu ? NOTE.truncated.ur : NOTE.truncated.en)(prepared.latest.pagesRead, prepared.latest.totalPages));
        }
        if (englishInstead) notes.push(NOTE.english);
        if (notes.length) {
          writer.write({ type: "text-delta", id, delta: `\n\n---\n${notes.map((n) => `*${n}*`).join("\n\n")}` });
        }
      } catch (e) {
        console.error("[upload] failed:", e);
        writer.write({ type: "text-delta", id, delta: errorMessage });
      }
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/** A short plain reply (used for upload problems such as an unsupported file). */
export function textResponse(text: string) {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "text-start", id: "msg" });
      writer.write({ type: "text-delta", id: "msg", delta: text });
      writer.write({ type: "text-end", id: "msg" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
