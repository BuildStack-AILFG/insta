"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades a section in as it scrolls into view. Content is fully visible on the server and for anyone who prefers reduced motion; only sections that
 * start below the fold are armed (see .st-reveal in app/s/store-templates.css).
 */
export default function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen
    el.classList.add("st-reveal");
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { el.classList.add("st-in"); io.disconnect(); }
    }, { threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
