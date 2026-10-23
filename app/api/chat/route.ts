import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

export const maxDuration = 60;

// Local model server (Ollama in dev/POC, vLLM in production). Both speak the
// OpenAI-style API, so only the URL and model name change between them.
const llm = createOpenAICompatible({
  name: "local-llm",
  baseURL: process.env.LLM_BASE_URL ?? "http://127.0.0.1:11434/v1",
});

const MODEL = process.env.LLM_MODEL ?? "gemma3:4b";

const BASE_PROMPT = [
  "You are the PLPA AI Assistant, helping employees of the Pakistan Land Port Authority.",
  "Be brief and clear. Your facts must be about Pakistan only, not India or other countries.",
  "Never invent fees, dates, rules or document names. If you are not sure, say so.",
].join(" ");

// A small model drifts between languages when both are mentioned in one prompt,
// so the language is detected here (Arabic/Urdu script or not) and only one is requested.
const LANGUAGE_PROMPT = {
  en: "Answer in English.",
  ur: "Answer in Urdu, using only Urdu script and simple formal Urdu. Do not use Hindi, Devanagari or Cyrillic words.",
};

const ARABIC_SCRIPT = /[؀-ۿ]/;

const systemPrompt = (messages: UIMessage[]) =>
  `${BASE_PROMPT} ${
    ARABIC_SCRIPT.test(lastUserText(messages))
      ? LANGUAGE_PROMPT.ur
      : LANGUAGE_PROMPT.en
  }`;

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
  const {
    messages,
    instructions,
  }: { messages: UIMessage[]; instructions?: string } = await req.json();

  if (lastUserText(messages) === "demo") {
    return demoResponse();
  }

  const result = streamText({
    model: llm(MODEL),
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
