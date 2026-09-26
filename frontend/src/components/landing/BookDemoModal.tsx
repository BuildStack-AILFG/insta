"use client";

import { useEffect } from "react";
import { ArrowRight, X } from "lucide-react";

type BookDemoModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function BookDemoModal({ open, onClose }: BookDemoModalProps) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const goToContact = () => {
    onClose();
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-brand/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-demo-title"
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">Book a demo</p>
        <h3
          id="book-demo-title"
          className="mt-2 pr-8 text-xl font-extrabold tracking-tight text-white"
          style={{ fontFamily: "var(--font-plus-jakarta)" }}
        >
          See it on your own Instagram account
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-white/60">
          Tell us a bit about your business and we&apos;ll set up a live walkthrough on your own Instagram account.
        </p>

        <button
          type="button"
          onClick={goToContact}
          className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Contact us
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
