"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { resolveTheme, themePreference, type Theme } from "@/lib/theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const preference = useRef<Theme | null>(null);
  const apply = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
      meta.content = next === "dark" ? "#0d1118" : "#F8FAFC";
    });
    setTheme(next);
  }, []);

  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    try { preference.current = themePreference(localStorage.getItem("theme")); } catch { /* Storage may be blocked. */ }
    apply(resolveTheme(preference.current, system.matches));
    const onSystem = () => apply(resolveTheme(preference.current, system.matches));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "theme" && event.key !== null) return;
      preference.current = themePreference(event.newValue);
      apply(resolveTheme(preference.current, system.matches));
    };
    system.addEventListener("change", onSystem);
    window.addEventListener("storage", onStorage);
    return () => { system.removeEventListener("change", onSystem); window.removeEventListener("storage", onStorage); };
  }, [apply]);

  const toggle = () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    preference.current = next;
    apply(next);
    try { localStorage.setItem("theme", next); } catch { /* Retain the in-memory choice. */ }
  };
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Theme controls must be inside ThemeProvider.");
  return value;
}
