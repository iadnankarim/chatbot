// Knowledge Base mode: answer ONLY from PLPA documents, show where the answer came from,
// and clearly say "not found" when the documents do not contain it.
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  streamText,
  type LanguageModel,
  type UIMessage,
} from "ai";
import type { SessionUser } from "@/lib/session";
import { embedQuery } from "@/lib/kb/embed";
import { search, type Hit } from "@/lib/kb/store";

// Below this score nothing in the documents is even close, so we answer "not found"
// without calling the model. Measured on the sample documents: relevant questions
// scored 0.48 - 0.72, unrelated ones 0.27 - 0.36 (near-topic ones such as "passport fee"
// reach 0.56, those are left to the model's "not found" rule).
const MIN_SCORE = Number(process.env.KB_MIN_SCORE ?? 0.45);
// A very clear match (0.66+) is answered straight away. Weaker matches get a yes/no check
// first. On the sample documents related-but-unanswerable questions scored at most 0.64.
const VERIFY_BELOW = Number(process.env.KB_VERIFY_BELOW ?? 0.66);
const MAX_CHUNKS = 3;
const SCORE_WINDOW = 0.08; // only use chunks close to the best match

const ARABIC_SCRIPT = /[؀-ۿ]/;

const NOT_FOUND = {
  en: "Not found in the documents.",
  ur: "دستاویزات میں یہ معلومات نہیں ملیں۔",
};

// A small model does not always use the exact sentence, so recognise the usual ways of
// saying "the documents do not have it" and always show our own clear sentence instead.
const LOOKS_NOT_FOUND = new RegExp(
  [
    "not found",
    "not (?:available|mentioned|specified|provided|stated) in",
    "(?:does|do|did) not (?:contain|mention|specify|provide|include|have)",
    "no (?:information|mention|details?) ",
    "cannot (?:find|answer)",
    "نہیں ملیں|نہیں ملی|نہیں ملا",
    "موجود نہیں",
    "معلومات نہیں",
    "ذکر نہیں",
    "درج نہیں",
    "دستیاب نہیں",
  ].join("|"),
  "i",
);

const NOT_FOUND_SENTENCE = new RegExp(
  `\\s*(?:${NOT_FOUND.en.replace(/\./g, "\\.")}|${NOT_FOUND.ur})\\s*`,
  "g",
);

// "[1]" or "[1, 2]": the model names the passage it used. Used to pick the sources, never shown.
const MARKER = /\s*\[\d+(?:\s*,\s*\d+)*\]/g;

// Hold the start back until we know it is a real answer, and the end back so that a
// trailing "not found" sentence or a half-written marker never reaches the screen.
const START_HOLD = 80;
const END_HOLD = 40;

const textOf = (m?: UIMessage) =>
  m?.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim() ?? "";

function buildQuery(messages: UIMessage[]) {
  const users = messages.filter((m) => m.role === "user");
  const last = textOf(users.at(-1));
  // A very short follow-up ("and for urgent?") needs the previous question for context.
  return last.length < 25 && users.length > 1 ? `${textOf(users.at(-2))} ${last}` : last;
}

/**
 * Fallback when the model cited nothing usable: the retrieved chunks that share the most
 * words and numbers with the answer.
 */
function supportingHits(used: Hit[], answer: string) {
  const tokens = [
    ...new Set(answer.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N},.]*/gu) ?? []),
  ]
    .map((t) => t.replace(/[,.]+$/, ""))
    .filter((t) => t.length >= 2);

  const overlap = used.map((h) => {
    const text = h.text.toLowerCase();
    return tokens.filter((t) => text.includes(t)).length;
  });
  const max = Math.max(...overlap);
  if (max === 0) return used.slice(0, 1);
  return used.filter((_, i) => overlap[i] >= max * 0.9);
}

/** Passages the model cited, or the best matching ones if its citations are unusable. */
function citedHits(used: Hit[], rawAnswer: string): Hit[] {
  const nums = new Set<number>();
  for (const m of rawAnswer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of m[1].split(",")) nums.add(Number(n));
  }
  const cited = [...nums]
    .filter((n) => n >= 1 && n <= used.length)
    .sort((a, b) => a - b)
    .map((n) => used[n - 1]);
  return cited.length ? cited : supportingHits(used, rawAnswer);
}

const sourceLine = (h: Hit, urdu: boolean) =>
  h.page === null ? h.filename : `${h.filename} — ${urdu ? "صفحہ" : "page"} ${h.page}`;

function sourcesBlock(hits: Hit[], urdu: boolean) {
  const lines = [...new Set(hits.map((h) => sourceLine(h, urdu)))].map((l) => `- ${l}`);
  return `\n\n---\n**${urdu ? "ماخذ" : "Sources"}:**\n${lines.join("\n")}`;
}

const contextBlock = (hits: Hit[]) =>
  "CONTEXT:\n" + hits.map((h, i) => `[${i + 1}] ${h.text}`).join("\n\n");

// Instructions first, context last: with the context first the model answered "not found"
// to clear questions in testing.
function systemPrompt(hits: Hit[], urdu: boolean) {
  return [
    "You are the PLPA document assistant. Answer ONLY from the CONTEXT below.",
    `If the answer is not in the CONTEXT, reply exactly: ${urdu ? NOT_FOUND.ur : NOT_FOUND.en}`,
    "Use that sentence only when the CONTEXT has no answer at all. Never add it after you have given an answer.",
    "Never use outside knowledge and never guess. Answer in one to three short sentences.",
    "Answer only what was asked. Do not mention file names or page numbers, they are added automatically.",
    "End your answer with the number of the CONTEXT passage that contains it in square brackets, for example [1]. Cite only passages you actually used.",
    urdu
      ? "Answer in Urdu, using only Urdu script and simple formal Urdu."
      : "Answer in English.",
    `\n${contextBlock(hits)}`,
  ].join(" ");
}

// Second opinion before answering. The answer prompt alone let a small model reply to
// related-but-different questions (Umrah vs Hajj leave, overseas vs normal fee).
function verifyPrompt(hits: Hit[]) {
  return [
    contextBlock(hits),
    "\n\nYou check whether the CONTEXT above answers a QUESTION. Reply with one word: YES or NO.",
    "Reply YES only if the CONTEXT explicitly states the specific fact the question asks for.",
    "Reply NO if the CONTEXT only covers a related topic, or a different subject: a different type of leave, a different service, a different group of people, a different document or a different number.",
    "Related words are not enough, the exact thing asked must be written in the CONTEXT.",
  ].join(" ");
}

async function contextAnswers(model: LanguageModel, hits: Hit[], question: string) {
  try {
    const { text } = await generateText({
      model,
      system: verifyPrompt(hits),
      prompt: `QUESTION: ${question}`,
      temperature: 0,
      maxOutputTokens: 4,
    });
    return /^\W*(yes|ہاں)/i.test(text.trim());
  } catch (e) {
    // If the check itself fails, fall back to the answer prompt rather than blocking.
    console.error("[kb] verify failed:", e);
    return true;
  }
}

export function kbResponse(opts: {
  messages: UIMessage[];
  user: SessionUser;
  model: LanguageModel;
  errorMessage: string;
}) {
  const { messages, user, model, errorMessage } = opts;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const id = "kb";
      const send = (delta: string) => delta && writer.write({ type: "text-delta", id, delta });
      writer.write({ type: "text-start", id });

      try {
        const question = textOf(messages.filter((m) => m.role === "user").at(-1));
        const urdu = ARABIC_SCRIPT.test(question);
        const notFound = urdu ? NOT_FOUND.ur : NOT_FOUND.en;
        const found = search(await embedQuery(buildQuery(messages)), { k: 5, user });
        const best = found[0];

        if (!best || best.score < MIN_SCORE) {
          send(notFound);
        } else {
          const used = found
            .filter((h) => h.score >= Math.max(MIN_SCORE, best.score - SCORE_WINDOW))
            .slice(0, MAX_CHUNKS);

          if (best.score < VERIFY_BELOW && !(await contextAnswers(model, used, question))) {
            send(notFound);
            writer.write({ type: "text-end", id });
            return;
          }

          const result = streamText({
            model,
            system: systemPrompt(used, urdu),
            messages: [{ role: "user", content: question }],
            temperature: 0.1,
            onError: ({ error }) => console.error("[kb] model error:", error),
          });

          let raw = ""; // everything the model wrote
          let sentUpTo = 0; // raw[0..sentUpTo] is already on screen
          let mode: "undecided" | "answer" | "notfound" = "undecided";

          const release = () => {
            // Stop before a "[1]" that is still being written.
            let cut = raw.length - END_HOLD;
            const open = raw.lastIndexOf("[", cut);
            if (open >= 0 && open >= cut - 12 && !raw.slice(open, cut).includes("]")) cut = open;
            // Do not send the space in front of a marker that will be removed.
            while (cut > sentUpTo && /\s/.test(raw[cut - 1])) cut--;
            if (cut > sentUpTo) {
              send(raw.slice(sentUpTo, cut).replace(MARKER, ""));
              sentUpTo = cut;
            }
          };

          for await (const delta of result.textStream) {
            raw += delta;
            if (mode === "undecided" && raw.length > START_HOLD) {
              mode = LOOKS_NOT_FOUND.test(raw) ? "notfound" : "answer";
            }
            if (mode === "answer") release();
          }
          if (!raw.trim()) throw new Error("Model returned no text");
          if (mode === "undecided") mode = LOOKS_NOT_FOUND.test(raw) ? "notfound" : "answer";

          if (mode === "notfound") {
            send(notFound);
          } else {
            send(raw.slice(sentUpTo).replace(NOT_FOUND_SENTENCE, "").replace(MARKER, ""));
            send(sourcesBlock(citedHits(used, raw.replace(NOT_FOUND_SENTENCE, " ")), urdu));
          }
        }
      } catch (e) {
        console.error("[kb] failed:", e);
        send(errorMessage);
      }
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
