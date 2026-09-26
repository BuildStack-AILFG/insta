"use client";

import { useCallback, useSyncExternalStore } from "react";
import { THEME_KEY } from "./themeConfig";

export type Theme = "dark" | "light";

const listeners = new Set<() => void>();

// The <html data-theme> attribute is the single source of truth, so every toggle on the page (landing hero, dashboard bar) stays in step.
const snapshot = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
const serverSnapshot = (): Theme => "dark";

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    document.documentElement.dataset.theme = e.newValue === "light" ? "light" : "dark"; // another tab changed it
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode / blocked storage: the theme still applies for this page view.
  }
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const toggle = useCallback(() => setTheme(snapshot() === "light" ? "dark" : "light"), []);
  return { theme, isDark: theme === "dark", toggle, setTheme };
}
