"use client";

import Link from "next/link";
import { ArrowLeftIcon, RefreshCwIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

type Doc = { id: number; filename: string; department: string | null; pages: number; chunks: number; size: number };
type User = { id: number; username: string; name: string; department: string; role: string };
type Chat = { id: string; title: string; messageCount: number; updatedAt: string | null };
type Audit = { userId: number; username: string; name: string; department: string; threads: Chat[] };
type Msg = { role: string; text: string };

const card = "rounded-xl border p-5";
const th = "text-muted-foreground px-3 py-2 text-start text-xs font-medium";
const td = "px-3 py-2 align-top text-sm";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export default function AdminPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [viewing, setViewing] = useState<{ title: string; who: string; messages: Msg[] } | null>(null);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [department, setDepartment] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, u, a] = await Promise.all([
        api<{ documents: Doc[] }>("/api/kb/documents"),
        api<{ users: User[] }>("/api/admin/users"),
        api<{ users: Audit[] }>("/api/admin/audit"),
      ]);
      setDocs(d.documents);
      setUsers(u.users);
      setAudit(a.users);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Could not load." });
    }
  }, []);

  useEffect(() => {
    // Loading the lists when the page opens; the state is set after the requests finish.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const run = async (label: string, job: () => Promise<string>) => {
    setBusy(true);
    setStatus({ kind: "info", text: `${label}... this can take a minute.` });
    try {
      setStatus({ kind: "info", text: await job() });
      await load();
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong." });
    }
    setBusy(false);
  };

  const upload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setStatus({ kind: "error", text: "Choose a PDF or Word file first." });
    void run("Reading the document", async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("department", department);
      const r = await api<{ saved: string }>("/api/kb/upload", { method: "POST", body: form });
      if (fileRef.current) fileRef.current.value = "";
      return `Added ${r.saved}.`;
    });
  };

  const reindex = () =>
    void run("Reading all documents again", async () => {
      const r = await api<{ added: string[]; failed: { file: string; error: string }[] }>("/api/kb/reindex?force=1", { method: "POST" });
      return r.failed.length
        ? `Done, but ${r.failed.length} file(s) failed: ${r.failed.map((f) => `${f.file} (${f.error})`).join("; ")}`
        : `Done. ${r.added.length} document(s) read.`;
    });

  const remove = (d: Doc) => {
    if (!window.confirm(`Delete "${d.filename}"? The file is removed from the server too.`)) return;
    void run("Deleting", async () => {
      await api(`/api/kb/documents?id=${d.id}`, { method: "DELETE" });
      return `Deleted ${d.filename}.`;
    });
  };

  const openChat = async (u: Audit, c: Chat) => {
    try {
      const r = await api<{ messages: Msg[] }>(`/api/admin/audit?user=${u.userId}&thread=${encodeURIComponent(c.id)}`);
      setViewing({ title: c.title, who: `${u.name} (${u.department})`, messages: r.messages });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Could not open the chat." });
    }
  };

  const departments = [...new Set(users.map((u) => u.department))];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8">
      <header className="flex items-center gap-3">
        <BrandMark className="size-10" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{BRAND.name}: Admin</h1>
          <p className="text-muted-foreground text-sm">Documents, users and chat audit</p>
        </div>
        <Link href="/" className="hover:bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-sm">
          <ArrowLeftIcon className="size-4" /> Back to chat
        </Link>
      </header>

      {status && (
        <p role="status" className={`rounded-lg px-4 py-3 text-sm ${status.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
          {status.text}
        </p>
      )}

      <section className={card}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="me-auto font-medium">Knowledge Base documents ({docs.length})</h2>
          <Button variant="secondary" size="sm" disabled={busy} onClick={reindex}>
            <RefreshCwIcon className="size-4" /> Read all again
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".pdf,.docx" className="text-sm" disabled={busy} />
          <select value={department} onChange={(e) => setDepartment(e.target.value)} disabled={busy} className="bg-background rounded-md border px-2 py-1.5 text-sm">
            <option value="">Visible to everyone</option>
            {departments.map((d) => (
              <option key={d} value={d}>Only {d}</option>
            ))}
          </select>
          <Button size="sm" disabled={busy} onClick={upload}>
            <UploadIcon className="size-4" /> Add document
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className={th}>File</th>
                <th className={th}>Who can see it</th>
                <th className={th}>Pages</th>
                <th className={th}>Passages</th>
                <th className={th}>Size</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className={td}>{d.filename}</td>
                  <td className={td}>{d.department ?? "Everyone"}</td>
                  <td className={td}>{d.pages}</td>
                  <td className={td}>{d.chunks}</td>
                  <td className={td}>{Math.round(d.size / 1024)} KB</td>
                  <td className={`${td} text-end`}>
                    <button type="button" title="Delete" aria-label={`Delete ${d.filename}`} disabled={busy} onClick={() => remove(d)} className="text-muted-foreground hover:text-destructive">
                      <Trash2Icon className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr><td className={td} colSpan={6}>No documents yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-4 font-medium">Users ({users.length})</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b"><th className={th}>Username</th><th className={th}>Name</th><th className={th}>Department</th><th className={th}>Role</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className={td}>{u.username}</td><td className={td}>{u.name}</td><td className={td}>{u.department}</td><td className={td}>{u.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={card}>
        <h2 className="mb-4 font-medium">Chat audit</h2>
        {audit.length === 0 && <p className="text-muted-foreground text-sm">No saved chats yet.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            {audit.map((u) => (
              <div key={u.userId}>
                <p className="mb-1 text-sm font-medium">{u.name} <span className="text-muted-foreground font-normal">({u.department})</span></p>
                <ul className="flex flex-col gap-1">
                  {u.threads.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => openChat(u, c)} className="hover:bg-muted w-full rounded-md px-3 py-2 text-start text-sm">
                        <span className="block truncate">{c.title}</span>
                        <span className="text-muted-foreground text-xs">{c.messageCount} messages{c.updatedAt ? `, ${c.updatedAt}` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {viewing && (
            <div className="rounded-lg border p-4 text-sm">
              <p className="font-medium">{viewing.title}</p>
              <p className="text-muted-foreground mb-3 text-xs">{viewing.who}</p>
              <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
                {viewing.messages.map((m, i) => (
                  <div key={i} dir="auto">
                    <p className="text-muted-foreground text-xs">{m.role === "user" ? "User" : "Assistant"}</p>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
