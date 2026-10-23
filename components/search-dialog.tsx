"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { MessageCircleIcon, PlusCircleIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FC } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Row =
  | { kind: "thread"; id: string; title: string }
  | { kind: "action"; id: "new"; title: string };

const Kbd: FC<{ children: string }> = ({ children }) => (
  <kbd className="bg-muted text-muted-foreground rounded border px-1.5 py-0.5 text-[11px] font-medium">
    {children}
  </kbd>
);

export const SearchDialog: FC<{ onNavigate?: () => void }> = ({
  onNavigate,
}) => {
  const aui = useAui();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const threadItems = useAuiState((s) => s.threads.threadItems);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const q = query.trim().toLowerCase();
  const threads = useMemo<Row[]>(
    () =>
      threadItems
        .map((t) => ({
          kind: "thread" as const,
          id: t.id,
          title: t.title || "New Chat",
        }))
        .filter((t) => !q || t.title.toLowerCase().includes(q)),
    [threadItems, q],
  );
  const actions = useMemo<Row[]>(
    () =>
      !q || "new chat".includes(q)
        ? [{ kind: "action", id: "new", title: "New chat" }]
        : [],
    [q],
  );
  const rows = [...threads, ...actions];
  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const select = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "action") void aui.threads().switchToNewThread();
    else void aui.threads().switchToThread(row.id);
    onNavigate?.();
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(rows.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + rows.length) % Math.max(rows.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(rows[activeIndex]);
    }
  };

  const renderRow = (row: Row, index: number) => {
    const Icon = row.kind === "action" ? PlusCircleIcon : MessageCircleIcon;
    return (
      <button
        key={`${row.kind}-${row.id}`}
        type="button"
        onClick={() => select(row)}
        onMouseMove={() => setActive(index)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm",
          index === activeIndex && "bg-muted",
        )}
      >
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate">{row.title}</span>
      </button>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground bg-muted/40 hover:bg-muted/70 mb-2 flex h-[34px] w-full items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-start">Search</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent
          showCloseButton
          className="top-[15%] flex max-h-[70dvh] translate-y-0 flex-col gap-0 p-0 sm:max-w-2xl"
          onKeyDown={onKeyDown}
        >
          <div className="flex flex-col gap-3 p-5 pb-3">
            <DialogTitle className="text-base font-medium">Search</DialogTitle>
            <DialogDescription className="sr-only">
              Search your chats or run an action
            </DialogDescription>
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Search chats..."
              className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {threads.length > 0 && (
              <>
                <div className="text-muted-foreground px-3 pt-2 pb-1 text-xs">
                  Recents
                </div>
                {threads.map((row, i) => renderRow(row, i))}
              </>
            )}
            {actions.length > 0 && (
              <>
                <div className="text-muted-foreground px-3 pt-3 pb-1 text-xs">
                  Actions
                </div>
                {actions.map((row, i) => renderRow(row, threads.length + i))}
              </>
            )}
            {rows.length === 0 && (
              <div className="text-muted-foreground px-3 py-6 text-sm">
                No results found
              </div>
            )}
          </div>

          <div className="text-muted-foreground flex items-center gap-5 border-t px-5 py-3 text-xs">
            <span className="flex items-center gap-2">
              Close <Kbd>Esc</Kbd>
            </span>
            <span className="flex items-center gap-2">
              Navigate <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </span>
            <span className="flex items-center gap-2">
              Select <Kbd>↵</Kbd>
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
