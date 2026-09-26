"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { HELP } from "@/lib/site/help";

/** Searchable help articles. All answers are in the server-rendered HTML; search only narrows what's shown. */
export default function HelpCenter() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const needle = q.trim().toLowerCase();
  const groups = useMemo(
    () => HELP.filter((c) => cat === "all" || c.id === cat).map((c) => ({ ...c, faqs: c.faqs.filter((f) => !needle || (f.q + " " + f.a).toLowerCase().includes(needle)) })).filter((c) => c.faqs.length),
    [needle, cat],
  );

  return (
    <div>
      <div className="relative mx-auto mb-6 max-w-2xl">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <label htmlFor="help-search" className="sr-only">Search help articles</label>
        <input id="help-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search — e.g. GST invoice, comment to DM, 24-hour window" className="w-full rounded-xl border border-white/10 bg-field py-3.5 pl-11 pr-4 text-[15px] text-white placeholder:text-white/35 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
      </div>
      <div className="mb-10 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Help topics">
        {[{ id: "all", title: "All topics" }, ...HELP].map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${cat === c.id ? "btn-accent border-brand bg-brand text-white" : "border-white/10 text-white/60 hover:border-white/25 hover:text-white"}`}>{c.title}</button>
        ))}
      </div>

      <div className="mx-auto max-w-3xl space-y-10" aria-live="polite">
        {groups.length === 0 && <p className="py-10 text-center text-white/50">No answers match “{q}”. Try different words, or <a href="/contact?topic=support" className="text-brand underline">contact support</a>.</p>}
        {groups.map((c) => (
          <section key={c.id} aria-labelledby={`h-${c.id}`}>
            <h2 id={`h-${c.id}`} className="text-[1.3rem] font-bold text-white">{c.title}</h2>
            <p className="mb-4 mt-1 text-[14px] text-white/50">{c.blurb}</p>
            <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
              {c.faqs.map((f) => (
                <details key={f.q} className="group px-5 py-4 open:bg-white/[0.03]" open={!!needle}>
                  <summary className="cursor-pointer list-none text-[15px] font-semibold text-white [&::-webkit-details-marker]:hidden">{f.q}</summary>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-white/60">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
