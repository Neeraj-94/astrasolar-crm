"use client";

/**
 * Light/dark theme toggle — mirrors the toggleTheme() helper in
 * astrasolar-app: a single button that flips the <html> root class and
 * persists the choice in localStorage. The no-flash setup lives in
 * src/app/layout.tsx (inline script applied before hydration).
 */

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "astrasolar:theme"; // "light" | "dark"

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  // Manage BOTH classes: the light palette lives under `.light` and the dark
  // palette under `:root`/`.dark`. Toggling only `.dark` would leave light mode
  // with no theme class, falling back to the dark `:root` values.
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode — ignore */
  }
  window.setTimeout(() => root.classList.remove("theme-transition"), 400);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");

  // Read whatever the no-flash script applied pre-hydration.
  React.useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    applyTheme(next);
    setTheme(next);
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "h-9 w-9 inline-flex items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
