"use client";

import { useEffect, type ReactNode } from "react";

/** Lightweight smooth scroll — CSS native, no external deps. */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      document.documentElement.style.scrollBehavior = "smooth";
    }
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  return children;
}
