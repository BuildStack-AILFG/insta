"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Clock } from "lucide-react";
import type { Post } from "@/lib/site/blog";
import { formatDate } from "@/lib/site/config";

/** Every post is in the server-rendered HTML; the chips only filter what's visible. */
export default function BlogIndex({ posts, categories }: { posts: Post[]; categories: readonly string[] }) {
  const [cat, setCat] = useState<string>("All");
  const [first, ...rest] = posts;
  const list = cat === "All" ? rest : posts.filter((p) => p.category === cat);
  const showFeature = cat === "All" && first;

  return (
    <div>
      <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label="Filter by category">
        {["All", ...categories].map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${cat === c ? "btn-accent border-brand bg-brand text-white" : "border-white/10 text-white/60 hover:border-white/25 hover:text-white"}`}>{c}</button>
        ))}
      </div>

      {showFeature && (
        <Link href={`/blog/${first.slug}`} className="group mb-6 block rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-brand/40 hover:bg-white/[0.06] sm:p-9">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-brand">Featured · {first.category}</p>
          <h2 className="mt-3 max-w-3xl font-[family-name:var(--font-plus-jakarta)] text-[1.6rem] font-bold leading-tight tracking-tight text-white sm:text-[2rem]">{first.title}</h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-white/60">{first.excerpt}</p>
          <p className="mt-5 flex items-center gap-4 text-[13px] text-white/45"><span>{formatDate(first.published)}</span><span className="flex items-center gap-1"><Clock size={13} /> {first.readMinutes} min read</span><span className="ml-auto flex items-center gap-1 font-medium text-brand">Read <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span></p>
        </Link>
      )}

      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`} className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white/[0.06]">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-brand">{p.category}</p>
              <h3 className="mt-2 text-[17px] font-semibold leading-snug text-white">{p.title}</h3>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-white/55">{p.excerpt}</p>
              <p className="mt-4 flex items-center gap-3 text-[12.5px] text-white/40"><span>{formatDate(p.published)}</span><span className="flex items-center gap-1"><Clock size={12} /> {p.readMinutes} min</span></p>
            </Link>
          </li>
        ))}
      </ul>
      {list.length === 0 && !showFeature && <p className="py-12 text-center text-white/45">No articles in this category yet.</p>}
    </div>
  );
}
