// Text embeddings from the local model server (bge-m3 on Ollama now, vLLM later).
// Uses the OpenAI-style /embeddings endpoint, which both servers provide.

const BASE_URL = () => process.env.LLM_BASE_URL ?? "http://127.0.0.1:11434/v1";
const EMBED_MODEL = () => process.env.EMBED_MODEL ?? "bge-m3";
const BATCH = 16;

const normalize = (v: number[]) => {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Float32Array.from(v, (x) => x / norm);
};

/** Returns unit-length vectors, so a dot product equals cosine similarity. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await fetch(`${BASE_URL()}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL(), input: texts.slice(i, i + BATCH) }),
    });
    if (!res.ok) {
      throw new Error(`Embedding request failed: HTTP ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    for (const d of json.data) out.push(normalize(d.embedding));
  }
  return out;
}

export async function embedQuery(text: string): Promise<Float32Array> {
  return (await embedTexts([text]))[0];
}
