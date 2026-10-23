"use client";

import {
  ChevronDownIcon,
  GlobeIcon,
  HelpCircleIcon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type FC } from "react";
import { SettingsDialog } from "@/components/settings-dialog";
import { FEATURES } from "@/lib/brand";
import { cn } from "@/lib/utils";

const USER = { name: "Chatbot", email: "demo@example.com" };

const ITEMS = [
  { label: "Settings", icon: SettingsIcon, onSelect: "settings" },
  { label: "Language", icon: GlobeIcon, onSelect: "" },
  { label: "Get help", icon: HelpCircleIcon, onSelect: "" },
];

export const UserMenu: FC = () => {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // Until login exists the menu items do nothing, so show a plain user chip.
  if (!FEATURES.userMenu) {
    return (
      <div className="border-t p-2">
        <div className="flex h-11 items-center gap-3 px-2 text-sm">
          <span className="bg-muted flex size-7 items-center justify-center rounded-full text-xs font-medium">
            PE
          </span>
          <span className="flex-1 truncate">PLPA Employee</span>
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
            {USER.email}
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
            onClick={() => setOpen(false)}
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
          {USER.name
            .split(" ")
            .map((w) => w[0])
            .join("")}
        </span>
        <span className="flex-1 truncate text-start">{USER.name}</span>
        <ChevronDownIcon className="text-muted-foreground size-4" />
      </button>
    </div>
  );
};
