"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";

// A logged-in user changes their own password.
export default function AccountPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (next !== again) return setMessage({ ok: false, text: "The two new passwords are not the same." });
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCurrent("");
        setNext("");
        setAgain("");
        setMessage({ ok: true, text: "Your password has been changed." });
      } else {
        setMessage({ ok: false, text: data.error ?? "Could not change the password." });
      }
    } catch {
      setMessage({ ok: false, text: "Cannot reach the server. Please try again." });
    }
    setBusy(false);
  };

  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <div>
            <h1 className="font-semibold">{BRAND.name}</h1>
            <p className="text-muted-foreground text-sm">Change your password</p>
          </div>
        </div>
        <Input type="password" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input type="password" placeholder="New password (at least 8 characters)" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Input type="password" placeholder="New password again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "" : "text-destructive"}`}>
            {message.text}
          </p>
        )}
        <Button type="submit" disabled={busy || !current || !next || !again}>
          Change password
        </Button>
        <Link href="/" className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 text-sm">
          <ArrowLeftIcon className="size-4" /> Back to chat
        </Link>
      </form>
    </main>
  );
}
