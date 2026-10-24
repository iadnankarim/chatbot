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
import { stripForeignScripts } from "@/lib/clean-urdu";
import { logEvent } from "@/lib/events";
import { embedQuery } from "@/lib/kb/embed";
import { latinShare, translate, translateToUrdu } from "@/lib/translate";
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
// Fixed seed: the same question over the same documents gives the same answer every time,
// so what is rehearsed before a demo is what appears in it.
const SEED = 7;
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

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "was", "with", "that", "this", "from", "shall", "may", "not",
  "any", "all", "has", "have", "its", "into", "under", "such", "must", "can", "will", "been",
  "being", "who", "which", "their", "there", "per", "each", "also",
]);

/** The words and numbers that carry meaning in the answer (markers and filler removed). */
function answerTokens(answer: string) {
  return [
    ...new Set(
      answer.toLowerCase().replace(/\[\d+(?:\s*,\s*\d+)*\]/g, " ").match(/[\p{L}\p{N}]+/gu) ?? [],
    ),
  ].filter((t) => (t.length >= 3 || /\d/.test(t)) && !STOP_WORDS.has(t));
}

/** Share (0 to 1) of the answer's words that also appear in the passage. */
const coverage = (hit: Hit, tokens: string[]) => {
  if (!tokens.length) return 0;
  const text = hit.text.toLowerCase();
  return tokens.filter((t) => text.includes(t)).length / tokens.length;
};

// If at least this share of the answer's words is in a passage, that passage is the source.
const STRONG_COVERAGE = 0.6;

/**
 * Which retrieved passages to show as the source. The answer's own words are the most
 * reliable evidence, so the passage that contains most of them wins. When the answer is in
 * another language than the document there is little to compare, and then the passage the
 * model cited is used (or, failing that, the best search match).
 */
function chooseSources(used: Hit[], rawAnswer: string): Hit[] {
  const scores = used.map((h) => coverage(h, answerTokens(rawAnswer)));
  const best = Math.max(...scores);
  if (best >= STRONG_COVERAGE) return used.filter((_, i) => scores[i] >= best - 0.05);

  const nums = new Set<number>();
  for (const m of rawAnswer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of m[1].split(",")) nums.add(Number(n));
  }
  const cited = [...nums]
    .filter((n) => n >= 1 && n <= used.length)
    .sort((a, b) => a - b)
    .map((n) => used[n - 1]);
  return cited.length ? cited : used.slice(0, 1);
}

/**
 * The page(s) a passage's answer is on. A passage can run across a page break; the page whose
 * part of the text shares the most words with the answer is the one to name.
 */
function pagesFor(hit: Hit, answer: string): [number, number] | null {
  if (hit.page === null) return null;
  const last = hit.pageEnd ?? hit.page;
  if (last === hit.page || hit.pageMap.length < 2) return [hit.page, last];

  const tokens = answerTokens(answer);
  const parts = hit.pageMap.map(([from, page], i) => ({
    page,
    text: hit.text.slice(from, hit.pageMap[i + 1]?.[0]).toLowerCase(),
  }));
  const scores = parts.map((p) => tokens.filter((t) => p.text.includes(t)).length);
  const best = Math.max(...scores);
  if (best === 0) return [hit.page, last];
  const pages = parts.filter((_, i) => scores[i] === best).map((p) => p.page);
  return [Math.min(...pages), Math.max(...pages)];
}

// Each source is a link that opens the document (a PDF opens at the page, see /api/kb/file).
function sourceLine(h: Hit, urdu: boolean, answer: string) {
  const pages = pagesFor(h, answer);
  const url = `/api/kb/file?id=${h.docId}`;
  if (!pages) return `[${h.filename}](${url})`;
  const range = pages[0] !== pages[1];
  const label = urdu ? (range ? "صفحات" : "صفحہ") : range ? "pages" : "page";
  return `[${h.filename} — ${label} ${range ? `${pages[0]}–${pages[1]}` : pages[0]}](${url}#page=${pages[0]})`;
}

function sourcesBlock(hits: Hit[], urdu: boolean, answer: string) {
  const lines = [...new Set(hits.map((h) => sourceLine(h, urdu, answer)))].map((l) => `- ${l}`);
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
    "If the question asks for the name of a person, reply YES only if an actual personal name is written in the CONTEXT, not a job title, a role or a garbled word.",
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
      seed: SEED,
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
      let urduMode = false; // Urdu answers get stray letters of other scripts removed
      const send = (raw: string) => {
        const delta = urduMode ? stripForeignScripts(raw) : raw;
        return delta && writer.write({ type: "text-delta", id, delta });
      };
      writer.write({ type: "text-start", id });

      try {
        const question = textOf(messages.filter((m) => m.role === "user").at(-1));
        const urdu = ARABIC_SCRIPT.test(question);
        urduMode = urdu;
        const notFound = urdu ? NOT_FOUND.ur : NOT_FOUND.en;
        const found = search(await embedQuery(buildQuery(messages)), { k: 5, user });
        const best = found[0];

        if (!best || best.score < MIN_SCORE) {
          logEvent(user, "kb_not_found", question);
          send(notFound);
        } else {
          const used = found
            .filter((h) => h.score >= Math.max(MIN_SCORE, best.score - SCORE_WINDOW))
            .slice(0, MAX_CHUNKS);

          // Urdu question over English documents: a small model reads English far better than
          // it answers in Urdu, so work in English and translate only the short final answer.
          const viaEnglish = urdu && used.every((h) => latinShare(h.text) > 0.7);
          const englishQuestion = viaEnglish ? await translate(model, question, "English") : question;

          const verified = best.score < VERIFY_BELOW ? await contextAnswers(model, used, englishQuestion) : true;
          console.info(`[kb] score=${best.score.toFixed(2)} viaEnglish=${viaEnglish} q="${englishQuestion}" verified=${verified} chunks=${used.map((h) => `${h.filename}:${h.page}`).join(",")}`);
          if (!verified) {
            logEvent(user, "kb_not_found", question);
            send(notFound);
            writer.write({ type: "text-end", id });
            return;
          }

          if (viaEnglish) {
            const { text } = await generateText({
              model,
              system: systemPrompt(used, false),
              prompt: englishQuestion,
              temperature: 0.1,
              seed: SEED,
              maxOutputTokens: 200,
            });
            if (LOOKS_NOT_FOUND.test(text) || !text.trim()) {
              logEvent(user, "kb_not_found", question);
              send(notFound);
            } else {
              const answerEn = text.replace(NOT_FOUND_SENTENCE, " ");
              send(await translateToUrdu(model, answerEn.replace(MARKER, "")));
              send(sourcesBlock(chooseSources(used, answerEn), true, answerEn));
            }
            writer.write({ type: "text-end", id });
            return;
          }

          const result = streamText({
            model,
            system: systemPrompt(used, urdu),
            messages: [{ role: "user", content: question }],
            temperature: 0.1,
            seed: SEED,
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
            logEvent(user, "kb_not_found", question);
            send(notFound);
          } else {
            send(raw.slice(sentUpTo).replace(NOT_FOUND_SENTENCE, "").replace(MARKER, ""));
            const answerText = raw.replace(NOT_FOUND_SENTENCE, " ");
            send(sourcesBlock(chooseSources(used, answerText), urdu, answerText));
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
