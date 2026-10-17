"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import type { PublicProduct } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { isDemoSlug, searchDemo } from "@/lib/store/demos";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api";

/** Navbar search: suggestions appear as you type; tapping one opens the product. On phones it starts as an icon and opens full width. */
export default function StoreSearch({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicProduct[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim();
  const shown = term.length >= 2 ? results : null;  // too-short input hides suggestions without resetting state in the effect

  useEffect(() => {
    if (term.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      if (isDemoSlug(slug)) { setResults(searchDemo(slug, term)); return; }
      try {
        const res = await fetch(`${API_URL}/public/store/${encodeURIComponent(slug)}/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (res.ok) setResults(((await res.json()) as { products: PublicProduct[] }).products);
      } catch { /* aborted or offline: keep what's shown */ }
    }, 250);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [term, slug]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const close = () => { setOpen(false); setQ(""); setResults(null); };
  const show = (v: boolean) => { setOpen(v); if (v) setTimeout(() => input.current?.focus(), 0); };

  return (
    <div ref={box} className={open ? "absolute inset-x-0 top-0 z-40 flex h-16 items-center bg-[var(--bg)] px-4 md:static md:inset-auto md:block md:h-auto md:bg-transparent md:p-0" : "md:relative"}>
      <button onClick={() => show(true)} aria-label="Search" className={`h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--soft)] md:hidden ${open ? "hidden" : "flex"}`}><Search size={19} /></button>
      <div className={`relative w-full md:w-64 lg:w-72 ${open ? "block" : "hidden md:block"}`}>
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => e.key === "Escape" && close()}
          placeholder="Search products" aria-label="Search products" maxLength={60}
          className="h-10 w-full rounded-full border border-[var(--line)] bg-[var(--soft)] pl-9 pr-9 text-[14px] outline-none placeholder:text-[var(--faint)] focus:border-[var(--muted)]" />
        {(q || open) && <button onClick={close} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--muted)] hover:text-[var(--fg)] md:hidden"><X size={16} /></button>}
        {open && shown && (
          <div className="absolute left-0 right-0 top-12 max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-1.5 shadow-xl shadow-black/10 md:min-w-80">
            {shown.length === 0 ? <div className="px-3 py-4 text-center text-[13.5px] text-[var(--muted)]">No products match “{term}”.</div> : shown.map((p) => (
              <Link key={p.id} href={`/s/${slug}/p/${p.id}`} onClick={close} className="flex items-center gap-3 rounded-xl p-2 hover:bg-[var(--soft)]">
                {p.image_url ? <img src={p.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <span className="h-12 w-12 shrink-0 rounded-lg bg-[var(--soft)]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{p.name}</span>
                  {p.category && <span className="block truncate text-[11.5px] text-[var(--faint)]">{p.category}</span>}
                </span>
                <span className="shrink-0 text-[13.5px] font-semibold">{p.price_varies ? "from " : ""}{fmtMoney(p.price)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
