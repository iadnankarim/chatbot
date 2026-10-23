// Loads the chat model into memory when the app starts, so the first user
// question does not wait for a cold model load (30-45 s on the POC laptop).
// Ollama only: other servers (vLLM) keep the model loaded already.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function warmUpModel() {
  if (process.env.LLM_WARMUP === "off") return;

  const baseURL = process.env.LLM_BASE_URL ?? "http://127.0.0.1:11434/v1";
  const model = process.env.LLM_MODEL ?? "gemma3:4b";
  const ollamaURL = baseURL.replace(/\/v1\/?$/, "");

  // Ollama may still be starting, so retry for about a minute.
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const started = Date.now();
      // An empty prompt only loads the model; keep_alive -1 keeps it loaded.
      const res = await fetch(`${ollamaURL}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: "", keep_alive: -1 }),
      });
      if (res.status === 404) {
        console.warn(`[warmup] model "${model}" not found on ${ollamaURL}; skipping`);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`[warmup] ${model} ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return;
    } catch (error) {
      if (attempt === 12) {
        console.warn("[warmup] giving up:", error instanceof Error ? error.message : error);
        return;
      }
      await sleep(5000);
    }
  }
}
