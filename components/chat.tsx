"use client";

import {
  AssistantRuntimeProvider,
  AuiProvider,
  Suggestions,
  useAui,
  useAuiState,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { useChat } from "@ai-sdk/react";
import {
  createLocalStorageAdapter,
  createSimpleTitleAdapter,
} from "@assistant-ui/core/react";
import {
  AssistantChatTransport,
  useAISDKRuntime,
} from "@assistant-ui/react-ai-sdk";
import { FolderIcon, PanelLeftIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import {
  ProjectsProvider,
  projectSystemPrompt,
  useProjects,
} from "@/components/projects-context";
import { ProjectsList } from "@/components/projects-view";
import { Thread } from "@/components/thread.aui";
import { ThreadList } from "@/components/thread-list.aui";
import { UserMenu } from "@/components/user-menu";
import { documentAttachmentAdapter } from "@/lib/attachment-adapter";
import { feedbackAdapter } from "@/lib/feedback-adapter";
import { serverStorage } from "@/lib/server-storage";
import { BrandMark } from "@/components/brand-mark";
import { KbModeProvider, useKbMode } from "@/components/kb-mode";
import { BRAND, FEATURES, KB_SUGGESTIONS, SUGGESTIONS } from "@/lib/brand";
import { cn } from "@/lib/utils";

// Keeps new chats attached to the project they were started from, and feeds
// that project's instructions into the next request.
function ProjectThreadSync() {
  const {
    activeProjectId,
    projects,
    threadProjects,
    assignThread,
    instructionsRef,
  } = useProjects();
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
  const newThreadId = useAuiState((s) => s.threads.newThreadId);

  useEffect(() => {
    if (activeProjectId && mainThreadId && mainThreadId === newThreadId) {
      assignThread(mainThreadId, activeProjectId);
    }
  }, [activeProjectId, mainThreadId, newThreadId, assignThread]);

  useEffect(() => {
    const projectId = threadProjects[mainThreadId];
    instructionsRef.current = projectSystemPrompt(
      projects.find((p) => p.id === projectId),
    );
  }, [mainThreadId, threadProjects, projects, instructionsRef]);

  return null;
}

function ChatLayout() {
  const { kbOn } = useKbMode();
  const aui = useAui({
    suggestions: Suggestions(kbOn ? KB_SUGGESTIONS : SUGGESTIONS),
  });
  const { view, setView, setActiveProjectId, setCreateOpen } = useProjects();
  const [collapsed, setCollapsed] = useState(false);

  // Any plain chat navigation leaves the project context.
  const showChat = () => {
    setActiveProjectId(null);
    setView("chat");
  };

  return (
    <AuiProvider value={aui}>
      <ProjectThreadSync />
      <CreateProjectDialog />
      <div className="flex h-dvh bg-background text-foreground">
        <aside
          className={cn(
            "hidden w-[310px] shrink-0 flex-col border-r",
            !collapsed && "md:flex",
          )}
        >
          <div className="flex h-12 items-center gap-2 px-3 text-base font-semibold">
            <button
              type="button"
              title="Close sidebar"
              aria-label="Close sidebar"
              onClick={() => setCollapsed(true)}
              className="hover:bg-muted text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-md"
            >
              <PanelLeftIcon className="size-4" />
            </button>
            <BrandMark />
            <span className="truncate">{BRAND.name}</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pt-1 pb-2">
            <ThreadList
              onNavigate={showChat}
              extraItems={
                FEATURES.projects ? (
                <div
                  className={cn(
                    "group hover:bg-muted flex h-8 items-center rounded-md pe-1",
                    view !== "chat" && "bg-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setView("projects")}
                    className="flex h-full flex-1 items-center gap-2 px-2.5 text-sm"
                  >
                    <FolderIcon className="size-4" />
                    Projects
                  </button>
                  <button
                    type="button"
                    title="Create project"
                    aria-label="Create project"
                    onClick={() => setCreateOpen(true)}
                    className="hover:bg-background/60 text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md"
                  >
                    <PlusIcon className="size-4" />
                  </button>
                </div>
                ) : undefined
              }
            />
          </div>
          <UserMenu />
        </aside>
        <main className="relative min-w-0 flex-1">
          {collapsed && (
            <button
              type="button"
              title="Open sidebar"
              aria-label="Open sidebar"
              onClick={() => setCollapsed(false)}
              className="hover:bg-muted text-muted-foreground hover:text-foreground absolute start-3 top-2 z-10 hidden size-8 items-center justify-center rounded-md md:flex"
            >
              <PanelLeftIcon className="size-4" />
            </button>
          )}
          {view === "chat" && <Thread />}
          {view === "projects" && <ProjectsList />}
        </main>
      </div>
    </AuiProvider>
  );
}

function ChatRuntime() {
  const { instructionsRef } = useProjects();
  const { kbRef } = useKbMode();

  const transport = useMemo(
    () =>
      // The refs are only read when a message is sent, not while rendering.
      // eslint-disable-next-line react-hooks/refs
      new AssistantChatTransport({
        api: "/api/chat",
        body: () => ({ instructions: instructionsRef.current, kb: kbRef.current }),
      }),
    [instructionsRef, kbRef],
  );

  // Threads and messages are saved on the server for the logged-in user (app/api/storage),
  // so chats survive a refresh and are never shared between users.
  const adapter = useMemo(
    () =>
      createLocalStorageAdapter({
        storage: serverStorage,
        prefix: "plpa:",
        titleGenerator: createSimpleTitleAdapter(),
      }),
    [],
  );

  const runtime = useRemoteThreadListRuntime({
    adapter,
    runtimeHook: function RuntimeHook() {
      const chat = useChat({ transport });
      return useAISDKRuntime(chat, {
        adapters: { attachments: documentAttachmentAdapter, feedback: feedbackAdapter },
      });
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatLayout />
    </AssistantRuntimeProvider>
  );
}

export function Chat() {
  return (
    <KbModeProvider>
      <ProjectsProvider>
        <ChatRuntime />
      </ProjectsProvider>
    </KbModeProvider>
  );
}
