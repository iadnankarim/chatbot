import type { FeedbackAdapter } from "@assistant-ui/core";

// Sends the thumbs up / down of an answer to the server (shown to admins).
export const feedbackAdapter: FeedbackAdapter = {
  submit: ({ message, type }) => {
    const answer = message.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, answer }),
    }).catch(() => {});
  },
};
