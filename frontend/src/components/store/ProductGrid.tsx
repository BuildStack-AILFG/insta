"use client";

import { useState } from "react";
import ProductCard from "@/components/store/ProductCard";
import type { PublicProduct } from "@/lib/api";

/** The "all products" grid, with one filter chip per category the seller has used (none shown when nothing is categorised). */
export default function ProductGrid({ slug, products }: { slug: string; products: PublicProduct[] }) {
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [active, setActive] = useState<string | null>(null);
  const shown = active ? products.filter((p) => p.category === active) : products;
  const chip = (on: boolean) => `shrink-0 rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--line)] hover:border-[var(--muted)]"}`;

  return (
    <>
      {categories.length > 0 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
          <button className={chip(active === null)} onClick={() => setActive(null)}>All</button>
          {categories.map((c) => <button key={c} className={chip(active === c)} onClick={() => setActive(c)}>{c}</button>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((p) => <ProductCard key={p.id} slug={slug} product={p} />)}
      </div>
    </>
  );
}
