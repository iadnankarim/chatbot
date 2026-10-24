# PLPA AI Assistant

An offline, ChatGPT-style assistant for Pakistan Land Port Authority employees. It runs on PLPA's own
machine: no cloud, no external API. This is the working proof of concept (POC) built for the MD demo.

## What it does

- **Login** (bcrypt passwords, signed cookie), one account per employee, per-user saved chats.
- **Chat** in English and Urdu with streaming answers.
- **Knowledge Base mode**: answers only from PLPA documents, shows the document name and page, and says
  "Not found in the documents" when the answer is not there. Department-only documents are supported.
- **File upload**: attach a PDF or Word file and get a summary or answers about it.
- **Admin screen** (`/admin`): add and delete documents, users, chat audit.

## Run it

Needs Windows, Node 22, [Ollama](https://ollama.com) with `gemma3:4b` and `bge-m3` (models kept in `D:\ollama-models`).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1     # model server + production app + warm-up + document reindex
```

Then open <http://localhost:3000> (use `localhost`) and sign in. Demo accounts: `admin`, `ahmed` (Operations),
`sara` (Finance), `usman` (HR). The demo password is in `lib/demo-users.ts`; **change it before any real use**.

Development: `npm run dev`. Production by hand: `npm run build && npm start`.

| Script | Purpose |
|---|---|
| `scripts/start-demo.ps1` | One command to get ready for a demo (rebuilds when the code changed) |
| `scripts/start-ollama.ps1` | Starts the model server with the models on D: and verifies they are visible |
| `scripts/reindex.ps1 [-Force]` | Reads new or changed documents into the Knowledge Base |
| `evals/` | Test scripts, see `evals/HOWTO.txt` |

## Configuration (`.env.local`, see `.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| `AUTH_SECRET` | none (required) | 32+ random characters; signs login cookies |
| `LLM_BASE_URL` | `http://127.0.0.1:11434/v1` | OpenAI-compatible model server (Ollama now, vLLM later) |
| `LLM_MODEL` / `EMBED_MODEL` | `gemma3:4b` / `bge-m3` | Chat model and embedding model |
| `KB_DOCS_DIR` | `../sample-docs` | Folder with the documents. A sub-folder name = department that may read them |
| `KB_MIN_SCORE` / `KB_VERIFY_BELOW` | `0.45` / `0.66` | Retrieval thresholds (measured on the sample documents) |
| `UPLOAD_MAX_CHARS` | `4500` | How much of an attached file is read (raise on a GPU server) |
| `COOKIE_SECURE` | `false` | Set `true` once the app is served over HTTPS |

## How it fits together

```
Browser (Next.js, React) --> /api/chat --> model server (Ollama: gemma3:4b, bge-m3)
                                 |
              lib/kb (extract -> chunk -> embed -> SQLite vectors), lib/uploads, lib/session
                                 |
                          data/plpa.db  (users, saved chats, Knowledge Base)
```

- `app/api/chat/route.ts`: general chat, Knowledge Base (`lib/kb/answer.ts`) and attached files (`lib/uploads.ts`).
- `lib/kb/`: PDF and Word reading (with Urdu PDF repair and table rows kept on one line), chunking with page
  numbers, embeddings, and search. Vectors live in SQLite for the POC; `lib/kb/store.ts` is the only file to swap for Qdrant.
- `proxy.ts`: pages need a login; `/admin` needs the admin role. Every API checks the session again.
- `lib/brand.ts`: names, suggestions and feature flags (Projects, Urdu interface, user menu are switched off).

## Known limits of the POC

- The 4B model on a laptop CPU is slow (10-100 s per answer depending on free RAM) and sometimes wrong or
  inconsistent, especially on questions close to, but not in, the documents. Every answer shows its source for that reason.
- Scanned (picture) PDFs have no OCR yet; Word files have no page numbers.
- Urdu answers about English files are given in English with a note.
- Nothing here has been load tested (the target is 30 concurrent users on an RTX 5090 server).

## Next steps (after approval)

GPU server with vLLM and a larger model, PostgreSQL and Qdrant, OCR (Tesseract, Urdu + English), user
management and password change, HTTPS, backups, a load test with 30 concurrent users.
