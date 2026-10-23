"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type MutableRefObject,
  type ReactNode,
} from "react";

export type Project = {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  context?: string;
  pinned?: boolean;
  archived?: boolean;
};

export type NewProject = Pick<Project, "name" | "description" | "context">;

/** Everything the assistant should know about a project, as one system prompt. */
export const projectSystemPrompt = (project: Project | undefined) =>
  [
    project?.description && `Project goal: ${project.description}`,
    project?.instructions,
    project?.context && `Project context:\n${project.context}`,
  ]
    .filter(Boolean)
    .join("\n\n");

// "chat" shows the thread, "projects" the project list.
export type View = "chat" | "projects";

type ProjectsContextValue = {
  projects: Project[];
  view: View;
  setView: (view: View) => void;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  createProject: (input: NewProject) => Project;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  /** Project being edited in the dialog, or null. */
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  updateProject: (id: string, patch: Partial<Omit<Project, "id">>) => void;
  deleteProject: (id: string) => void;
  /** threadId -> projectId. Lives in memory, like the threads themselves. */
  threadProjects: Record<string, string>;
  assignThread: (threadId: string, projectId: string) => void;
  /** Instructions of the project owning the thread that is about to send. */
  instructionsRef: MutableRefObject<string>;
};

const STORAGE_KEY = "ai-chatbot:projects";

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export const useProjects = () => {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used inside ProjectsProvider");
  return ctx;
};

export const ProjectsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [threadProjects, setThreadProjects] = useState<Record<string, string>>(
    {},
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const instructionsRef = useRef("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProjects(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {}
  }, [projects, loaded]);

  const createProject = useCallback((input: NewProject) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name: input.name.trim() || "Untitled project",
      description: input.description?.trim() ?? "",
      instructions: "",
      context: input.context?.trim() ?? "",
    };
    setProjects((p) => [project, ...p]);
    return project;
  }, []);

  const updateProject = useCallback(
    (id: string, patch: Partial<Omit<Project, "id">>) =>
      setProjects((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    [],
  );

  const deleteProject = useCallback((id: string) => {
    setProjects((p) => p.filter((x) => x.id !== id));
    setThreadProjects((m) =>
      Object.fromEntries(Object.entries(m).filter(([, pid]) => pid !== id)),
    );
    setActiveProjectId((a) => (a === id ? null : a));
  }, []);

  const assignThread = useCallback(
    (threadId: string, projectId: string) =>
      setThreadProjects((m) =>
        m[threadId] === projectId ? m : { ...m, [threadId]: projectId },
      ),
    [],
  );

  const value = useMemo(
    () => ({
      projects,
      view,
      setView,
      activeProjectId,
      setActiveProjectId,
      createProject,
      createOpen,
      setCreateOpen,
      editingId,
      setEditingId,
      updateProject,
      deleteProject,
      threadProjects,
      assignThread,
      instructionsRef,
    }),
    [
      projects,
      view,
      activeProjectId,
      createProject,
      createOpen,
      editingId,
      updateProject,
      deleteProject,
      threadProjects,
      assignThread,
    ],
  );

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
};
