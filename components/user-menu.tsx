"use client";

import {
  ChevronDownIcon,
  GlobeIcon,
  HelpCircleIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type FC } from "react";
import { SettingsDialog } from "@/components/settings-dialog";
import { FEATURES } from "@/lib/brand";
import { cn } from "@/lib/utils";

type CurrentUser = { name: string; department: string; username: string; role: string };

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.assign("/login");
  }
}

// Who is logged in (from the signed login cookie, via /api/auth/me).
function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d?.user && setUser(d.user))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return user;
}

const ITEMS = [
  { label: "Settings", icon: SettingsIcon, onSelect: "settings" },
  { label: "Language", icon: GlobeIcon, onSelect: "" },
  { label: "Get help", icon: HelpCircleIcon, onSelect: "" },
];

export const UserMenu: FC = () => {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const user = useCurrentUser();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Settings / Language / Help do nothing yet, so show a simple chip with Log out.
  if (!FEATURES.userMenu) {
    return (
      <div className="border-t p-2">
        <div className="flex h-12 items-center gap-3 px-2 text-sm">
          <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
            {user ? initials(user.name) : ""}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {user?.name ?? ""}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {user?.department ?? ""}
            </span>
          </span>
          {user?.role === "admin" && (
            <a
              href="/admin"
              title="Admin"
              aria-label="Admin"
              className="hover:bg-muted text-muted-foreground hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
            >
              <ShieldIcon className="size-4" />
            </a>
          )}
          <button
            type="button"
            title="Log out"
            aria-label="Log out"
            onClick={logout}
            className="hover:bg-muted text-muted-foreground hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <LogOutIcon className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  const itemClass =
    "hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm";

  return (
    <div ref={ref} className="relative border-t p-2">
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      {open && (
        <div
          role="menu"
          className="bg-popover absolute inset-x-2 bottom-full mb-2 rounded-xl border p-1.5 shadow-lg"
        >
          <div className="text-muted-foreground px-3 py-2 text-xs">
            {user?.username}
          </div>
          <div className="my-1 border-t" />
          {ITEMS.map(({ label, icon: Icon, onSelect }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (onSelect === "settings") setSettingsOpen(true);
              }}
              className={itemClass}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
          <div className="my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className={itemClass}
          >
            <LogOutIcon className="size-4" />
            Log out
          </button>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "hover:bg-muted flex h-11 w-full items-center gap-3 rounded-lg px-2 text-sm",
          open && "bg-muted",
        )}
      >
        <span className="bg-muted flex size-7 items-center justify-center rounded-full text-xs font-medium">
          {user ? initials(user.name) : ""}
        </span>
        <span className="flex-1 truncate text-start">{user?.name}</span>
        <ChevronDownIcon className="text-muted-foreground size-4" />
      </button>
    </div>
  );
};
