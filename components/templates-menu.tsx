"use client";

import { useAui } from "@assistant-ui/react";
import { FileTextIcon } from "lucide-react";
import { useEffect, useRef, useState, type FC } from "react";
import { TEMPLATES } from "@/lib/brand";
import { cn } from "@/lib/utils";

// Ready-made starting points for office writing. Choosing one fills the message box;
// the user replaces the [bracketed] parts and sends.
export const TemplatesMenu: FC = () => {
  const aui = useAui();
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Start from a ready-made template (notice, office order, letter...)"
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
          open
            ? "border-foreground/30 bg-muted text-foreground"
            : "border-foreground/15 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <FileTextIcon className="size-3.5" />
        Templates
      </button>
      {open && (
        <div role="menu" className="bg-popover absolute bottom-full start-0 z-50 mb-2 w-64 rounded-xl border p-1.5 shadow-lg">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              role="menuitem"
              onClick={() => {
                aui.composer().setText(t.prompt);
                setOpen(false);
              }}
              className="hover:bg-muted w-full rounded-md px-3 py-2 text-start text-sm"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
