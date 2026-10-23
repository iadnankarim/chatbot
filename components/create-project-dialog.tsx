"use client";

import { PlusIcon } from "lucide-react";
import { useState, type FC } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjects, type Project } from "@/components/projects-context";

const fieldClass =
  "bg-muted/40 placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none";

// Mounted only while the dialog is open, so its state starts fresh each time.
const ProjectForm: FC<{ editing: Project | undefined; onDone: () => void }> = ({
  editing,
  onDone,
}) => {
  const { createProject, updateProject, setView } = useProjects();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [context, setContext] = useState(editing?.context ?? "");
  const [showContext, setShowContext] = useState(!!editing?.context);

  const submit = () => {
    if (!name.trim()) return;
    if (editing) {
      updateProject(editing.id, {
        name: name.trim(),
        description: description.trim(),
        context: context.trim(),
      });
    } else {
      createProject({ name, description, context });
      setView("projects");
    }
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-2 text-sm font-medium">
        What are you working on?
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name your project"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium">
        What are you trying to achieve?
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe your project, goals, subject, etc..."
          className={`${fieldClass} resize-none`}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Context{" "}
          <span className="text-muted-foreground font-normal">optional</span>
        </span>
        {showContext ? (
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={4}
            placeholder="Background the assistant should know..."
            className={`${fieldClass} resize-none`}
          />
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => setShowContext(true)}
          >
            <PlusIcon className="size-4" /> Add context
          </Button>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {editing ? "Save changes" : "Create project"}
        </Button>
      </div>
    </form>
  );
};

export const CreateProjectDialog: FC = () => {
  const { projects, createOpen, setCreateOpen, editingId, setEditingId } =
    useProjects();
  const editing = projects.find((p) => p.id === editingId);

  const close = () => {
    setCreateOpen(false);
    setEditingId(null);
  };

  return (
    <Dialog
      open={createOpen || editing !== undefined}
      onOpenChange={(open) => (open ? setCreateOpen(true) : close())}
    >
      <DialogContent className="gap-5 p-6 sm:max-w-xl" showCloseButton>
        <div>
          <DialogTitle className="text-xl font-semibold">
            {editing ? "Edit project" : "Create a project"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Name your project and describe what you are working on
          </DialogDescription>
        </div>
        <ProjectForm editing={editing} onDone={close} />
      </DialogContent>
    </Dialog>
  );
};
