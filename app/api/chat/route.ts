import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

export const maxDuration = 60;

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });

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

// Canned streaming reply so the UI (scrolling etc.) can be tried without an API key.
// Triggered by sending "demo", or by any message while DEEPSEEK_API_KEY is unset.
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

  if (!process.env.DEEPSEEK_API_KEY || lastUserText(messages) === "demo") {
    return demoResponse();
  }

  const result = streamText({
    model: deepseek(process.env.DEEPSEEK_MODEL ?? "deepseek-chat"),
    system: instructions?.trim() || undefined,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
