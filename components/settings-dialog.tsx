"use client";

import { MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react";
import type { FC } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { setTheme, useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEMES: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

export const SettingsDialog: FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const theme = useTheme();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(34rem,85dvh)] max-w-[calc(100%-2rem)] gap-0 p-0 sm:max-w-3xl"
        showCloseButton
      >
        <nav className="flex w-56 shrink-0 flex-col gap-1 border-e p-3">
          <div className="text-muted-foreground px-2 py-2 text-xs">
            Settings
          </div>
          <button
            type="button"
            className="bg-muted flex items-center gap-3 rounded-md px-2 py-2 text-sm"
          >
            <SettingsIcon className="size-4" />
            General
          </button>
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          <DialogTitle className="text-base font-medium">Appearance</DialogTitle>
          <DialogDescription className="sr-only">
            Choose how the app looks
          </DialogDescription>

          <div className="mt-4 flex items-center justify-between border-b pb-4">
            <span className="text-sm">Theme</span>
            <div
              role="radiogroup"
              aria-label="Theme"
              className="bg-muted flex gap-0.5 rounded-lg p-1"
            >
              {THEMES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  aria-label={label}
                  title={label}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "text-muted-foreground flex size-7 items-center justify-center rounded-md",
                    theme === value && "bg-background text-foreground shadow-sm",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
