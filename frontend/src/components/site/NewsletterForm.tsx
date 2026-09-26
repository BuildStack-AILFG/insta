"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { ApiError, site } from "@/lib/api";

/** Newsletter sign-up. `tone="footer"` is for the always-dark footer block; `tone="page"` follows the theme. */
export default function NewsletterForm({ source, tone = "page", compact = false }: { source: string; tone?: "footer" | "page"; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      await site.newsletter(email.trim(), source, trap || undefined);
      setState("done");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? "Too many attempts — please try again later." : "Please enter a valid email address.");
      setState("idle");
    }
  };

  if (state === "done") return <p role="status" className="flex items-center gap-2 text-[13.5px] text-emerald-400"><Check size={16} /> You&apos;re subscribed. Thanks!</p>;
  const field = tone === "footer" ? "border-white/20 bg-white/10 text-white placeholder:text-white/40" : "border-white/10 bg-field text-white placeholder:text-white/35";
  return (
    <form onSubmit={submit} noValidate className={compact ? "" : "max-w-md"}>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`nl-${source}`}>Email address</label>
        <input id={`nl-${source}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-[14px] focus:border-brand focus:outline-none ${field}`} />
        {/* honeypot: real visitors never see or fill this */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />
        <button type="submit" disabled={state === "busy" || !email} className="btn-accent inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50">Subscribe <ArrowRight size={14} /></button>
      </div>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-red-400">{error}</p>}
    </form>
  );
}
