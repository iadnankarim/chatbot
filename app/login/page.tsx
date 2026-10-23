"use client";

import { useState, type FormEvent } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        // Full navigation so the chat starts fresh with the new session.
        window.location.assign("/");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed. Please try again.");
    } catch {
      setError("Cannot reach the server. Please try again.");
    }
    setBusy(false);
  };

  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-24" />
          <h1 className="text-xl font-semibold">{BRAND.name}</h1>
          <p className="text-muted-foreground text-sm">
            Pakistan Land Port Authority
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Username
            <Input
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Password
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10"
            />
          </label>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="h-10"
          >
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="text-muted-foreground mt-8 text-center text-xs">
          Authorised PLPA staff only. Activity may be logged.
        </p>
      </div>
    </main>
  );
}
