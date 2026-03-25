/**
 * useSearchPalette - Hook that manages open/close state for the SearchPalette.
 * Registers a global Cmd+K / Ctrl+K keyboard shortcut to toggle the palette open
 * and exposes open, setOpen, and an openSearch convenience function.
 */
"use client";

import { useEffect, useState } from "react";

export function useSearchPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}
