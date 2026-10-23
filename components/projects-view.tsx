"use client";

import { useAui } from "@assistant-ui/react";
import {
  ArchiveIcon,
  FolderIcon,
  MoreVerticalIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type FC } from "react";
import { Button } from "@/components/ui/button";
import { useProjects, type Project } from "@/components/projects-context";
import { cn } from "@/lib/utils";

const ProjectMenu: FC<{ project: Project }> = ({ project }) => {
  const { updateProject, deleteProject, setEditingId } = useProjects();
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

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const itemClass =
    "hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm";

  return (
    <div ref={ref} className="absolute inset-e-3 top-3">
      <button
        type="button"
        title="More"
        aria-label="Project options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-md",
          open && "bg-muted text-foreground",
        )}
      >
        <MoreVerticalIcon className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="bg-popover absolute inset-e-0 top-full z-20 mt-1 w-44 rounded-xl border p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(() =>
              updateProject(project.id, { pinned: !project.pinned }),
            )}
          >
            <PinIcon className="size-4" />
            {project.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(() => setEditingId(project.id))}
          >
            <PencilIcon className="size-4" />
            Edit details
          </button>
          <div className="my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(() =>
              updateProject(project.id, { archived: !project.archived }),
            )}
          >
            <ArchiveIcon className="size-4" />
            {project.archived ? "Unarchive" : "Archive"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={cn(itemClass, "text-destructive")}
            onClick={run(() => deleteProject(project.id))}
          >
            <TrashIcon className="size-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

export const ProjectsList: FC = () => {
  const aui = useAui();
  const { projects, setView, setCreateOpen, setActiveProjectId } =
    useProjects();
  const [showArchived, setShowArchived] = useState(false);

  const hasArchived = projects.some((p) => p.archived);
  const visible = projects
    .filter((p) => !!p.archived === showArchived)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  // Opening a project starts a fresh chat that carries the project's context.
  const openProject = (projectId: string) => {
    setActiveProjectId(projectId);
    void aui.threads().switchToNewThread();
    setView("chat");
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-6 overflow-y-auto px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {showArchived ? "Archived projects" : "Projects"}
        </h1>
        <div className="flex items-center gap-2">
          {(hasArchived || showArchived) && (
            <Button
              variant="ghost"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Back to projects" : "Archived"}
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" /> New project
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {showArchived
            ? "No archived projects."
            : "No projects yet. Create one to start chats with a shared goal and context."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((p) => (
            <div
              key={p.id}
              className="hover:bg-muted/50 relative rounded-xl border transition-colors"
            >
              <button
                type="button"
                onClick={() => openProject(p.id)}
                className="flex w-full flex-col gap-1 p-4 text-start"
              >
                <span className="flex items-center gap-2 pe-8 font-medium">
                  {p.pinned ? (
                    <PinIcon className="size-4 shrink-0" />
                  ) : (
                    <FolderIcon className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="text-muted-foreground line-clamp-2 text-sm">
                  {p.description || "No description"}
                </span>
              </button>
              <ProjectMenu project={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
