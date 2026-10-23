"use client";

import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
const EVENT = "themechange";
const DEFAULT_THEME: Theme = "light";

const readTheme = (): Theme => {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === "system" || t === "light" || t === "dark" ? t : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const applyTheme = (theme: Theme) => {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
};

export const setTheme = (theme: Theme) => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (onChange: () => void) => {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    if (readTheme() === "system") applyTheme("system");
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onMedia);
  };
};

export const useTheme = () =>
  useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
