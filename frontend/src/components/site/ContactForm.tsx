"use client";

import { Suspense, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { ApiError, site } from "@/lib/api";

const TOPICS = [
  { id: "sales", label: "Sales & pricing" },
  { id: "demo", label: "Book a demo" },
  { id: "support", label: "Product support" },
  { id: "partnership", label: "Partnership" },
  { id: "press", label: "Press & media" },
  { id: "other", label: "Something else" },
];

const field = "w-full rounded-lg border border-white/10 bg-field px-3.5 py-2.5 text-[14.5px] text-white placeholder:text-white/35 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

function Form({ defaultTopic }: { defaultTopic?: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const wanted = params.get("topic") ?? defaultTopic ?? "sales";
  const [topic, setTopic] = useState(TOPICS.some((t) => t.id === wanted) ? wanted : "other");
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      await site.contact({ topic, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, company: f.company.trim() || undefined, message: f.message.trim(), page: pathname, website: f.website || undefined });
      setState("done");
    } catch (err) {
      setState("idle");
      setError(err instanceof ApiError ? (err.status === 429 ? "You've sent a few messages already — please try again in an hour, or message us on WhatsApp." : err.message) : "Couldn't send your message. Please try again, or email us directly.");
    }
  };

  if (state === "done") {
    return (
      <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
        <CheckCircle2 className="mx-auto text-emerald-400" size={36} />
        <h3 className="mt-3 text-[20px] font-bold text-white">Thanks — we&apos;ve got your message</h3>
        <p className="mt-2 text-[14.5px] text-white/65">Someone from our team will reply to {f.email} soon. For anything urgent, message us on WhatsApp.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div>
        <label htmlFor="topic" className="mb-1.5 block text-[13px] font-medium text-white/70">What can we help with?</label>
        <select id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={field}>{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="name" className="mb-1.5 block text-[13px] font-medium text-white/70">Your name</label><input id="name" required maxLength={200} value={f.name} onChange={set("name")} autoComplete="name" className={field} /></div>
        <div><label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-white/70">Work email</label><input id="email" type="email" required value={f.email} onChange={set("email")} autoComplete="email" className={field} /></div>
        <div><label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium text-white/70">Phone / WhatsApp <span className="text-white/35">(optional)</span></label><input id="phone" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" className={field} /></div>
        <div><label htmlFor="company" className="mb-1.5 block text-[13px] font-medium text-white/70">Company <span className="text-white/35">(optional)</span></label><input id="company" maxLength={200} value={f.company} onChange={set("company")} autoComplete="organization" className={field} /></div>
      </div>
      <div>
        <label htmlFor="message" className="mb-1.5 block text-[13px] font-medium text-white/70">How can we help?</label>
        <textarea id="message" required minLength={5} maxLength={4000} rows={5} value={f.message} onChange={set("message")} className={field} placeholder="Tell us about your business and what you'd like to achieve on Instagram." />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13.5px] text-red-300">{error}</p>}
      <button type="submit" disabled={state === "busy"} className="btn-accent inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-[15px] font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60 sm:w-auto">
        {state === "busy" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send message
      </button>
      <p className="text-[12px] text-white/40">By sending this you agree to our <a href="/privacy" className="underline">Privacy Policy</a>. We&apos;ll only use your details to respond.</p>
    </form>
  );
}

export default function ContactForm({ defaultTopic }: { defaultTopic?: string }) {
  return <Suspense fallback={<div className="h-96 rounded-2xl border border-white/10 bg-white/[0.03]" />}><Form defaultTopic={defaultTopic} /></Suspense>;
}
