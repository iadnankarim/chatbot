import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import { getSessionUser } from "@/lib/auth";
import { kbResponse } from "@/lib/kb/answer";
import {
  documentResponse,
  prepareUploads,
  textResponse,
  UploadError,
} from "@/lib/uploads";

export const maxDuration = 60;

// Local model server (Ollama in dev/POC, vLLM in production). Both speak the
// OpenAI-style API, so only the URL and model name change between them.
const llm = createOpenAICompatible({
  name: "local-llm",
  baseURL: process.env.LLM_BASE_URL ?? "http://127.0.0.1:11434/v1",
});

const MODEL = process.env.LLM_MODEL ?? "gemma3:4b";

const BASE_PROMPT = [
  "You are the PLPA AI Assistant, a helpful assistant for employees of the Pakistan Land Port Authority (PLPA).",
  "Answer general questions on any topic normally and accurately.",
  "Be brief and clear. Never invent fees, dates, rules, names or numbers. If you are not sure, say so.",
].join(" ");

// In General mode the model has no PLPA documents and knows nothing reliable about
// PLPA (it makes up port names, counts and locations), so PLPA questions are sent
// to the Knowledge Base instead of being guessed.
const PLPA_TOPIC =
  /\b(plpa|land\s?ports?|torkham|chaman|wagah|taftan|sost|kharlachi|ghulam\s?khan|angoor\s?adda)\b|پی\s?ایل\s?پی\s?اے|لینڈ\s?پورٹ|طورخم|چمن|واہگہ|تفتان|سوست/i;

const PLPA_PROMPT =
  "This question is about PLPA. You have no verified PLPA information in this mode, so do not guess any facts, numbers, places, dates or names about PLPA. " +
  "Say briefly that verified PLPA answers are available in Knowledge Base mode, which answers only from PLPA documents.";

// A small model drifts between languages when both are mentioned in one prompt,
// so the language is detected here (Arabic/Urdu script or not) and only one is requested.
const LANGUAGE_PROMPT = {
  en: "Answer in English.",
  ur: "Answer in Urdu, using only Urdu script and simple formal Urdu. Do not use Hindi, Devanagari or Cyrillic words.",
};

const ARABIC_SCRIPT = /[؀-ۿ]/;

const systemPrompt = (messages: UIMessage[]) => {
  const text = lastUserText(messages);
  return [
    BASE_PROMPT,
    ARABIC_SCRIPT.test(text) ? LANGUAGE_PROMPT.ur : LANGUAGE_PROMPT.en,
    PLPA_TOPIC.test(text) && PLPA_PROMPT,
  ]
    .filter(Boolean)
    .join(" ");
};

const ERROR_MESSAGE =
  "The AI assistant is not responding right now. Please try again in a moment.\n\n" +
  "اے آئی اسسٹنٹ اس وقت جواب نہیں دے رہا۔ براہِ کرم تھوڑی دیر بعد دوبارہ کوشش کریں۔";

const lastUserText = (messages: UIMessage[]) =>
  messages
    .findLast((m) => m.role === "user")
    ?.parts.map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim()
    .toLowerCase() ?? "";

const demoReply = () =>
  Array.from({ length: 12 }, (_, i) =>
    [
      `## Section ${i + 1}`,
      `This is a sample paragraph used to test scrolling in the chat. ` +
        `It repeats a few sentences so the reply grows taller than the viewport. ` +
        `Streaming, markdown rendering and the scrollbar on the right can all be checked here.`,
      `- Point one of section ${i + 1}\n- Point two of section ${i + 1}\n- Point three of section ${i + 1}`,
    ].join("\n\n"),
  ).join("\n\n");

// Canned streaming reply so the UI (scrolling etc.) can be tried without the model.
// Triggered by sending "demo".
function demoResponse() {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "text-start", id: "demo" });
      for (const chunk of demoReply().match(/[\s\S]{1,40}/g) ?? []) {
        writer.write({ type: "text-delta", id: "demo", delta: chunk });
        await new Promise((r) => setTimeout(r, 15));
      }
      writer.write({ type: "text-end", id: "demo" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Please sign in." }, { status: 401 });
  }

  const {
    messages,
    instructions,
    kb,
  }: { messages: UIMessage[]; instructions?: string; kb?: boolean } =
    await req.json();

  if (lastUserText(messages) === "demo") {
    return demoResponse();
  }

  // A file is attached: summarize it or answer from it (takes priority over Knowledge Base mode).
  if (messages.some((m) => m.role === "user" && m.parts.some((p) => p.type === "file"))) {
    try {
      return await documentResponse({
        prepared: await prepareUploads(messages),
        model: llm(MODEL),
        errorMessage: ERROR_MESSAGE,
      });
    } catch (e) {
      if (e instanceof UploadError) return textResponse(e.message);
      throw e;
    }
  }

  // Knowledge Base mode: answers only from PLPA documents, with sources.
  if (kb) {
    return kbResponse({
      messages,
      user,
      model: llm(MODEL),
      errorMessage: ERROR_MESSAGE,
    });
  }

  const result = streamText({
    model: llm(MODEL),
    // Low temperature: fewer random wrong-script words in Urdu answers.
    temperature: 0.3,
    system: [systemPrompt(messages), instructions?.trim()]
      .filter(Boolean)
      .join("\n\n"),
    messages: await convertToModelMessages(messages),
    onError: ({ error }) => console.error("[chat] model error:", error),
  });

  return result.toUIMessageStreamResponse({
    onError: () => ERROR_MESSAGE,
  });
}
