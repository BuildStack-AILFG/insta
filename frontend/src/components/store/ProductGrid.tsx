"use client";

import { useState } from "react";
import ProductCard from "@/components/store/ProductCard";
import type { PublicProduct } from "@/lib/api";

type Sort = "featured" | "low" | "high";

/** A product grid with a result count, sort and an in-stock filter. The page decides which products go in (all, or one category). */
export default function ProductGrid({ slug, products }: { slug: string; products: PublicProduct[] }) {
  const [sort, setSort] = useState<Sort>("featured");
  const [inStock, setInStock] = useState(false);
  const shown = products.filter((p) => !inStock || !p.sold_out);
  if (sort !== "featured") shown.sort((a, b) => (sort === "low" ? a.price - b.price : b.price - a.price));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-[var(--line)] py-3 text-[13.5px]">
        <span className="text-[var(--muted)]">{shown.length} product{shown.length === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="accent-[var(--accent)]" /> In stock only</label>
          <label className="flex items-center gap-2 text-[var(--muted)]">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-[13.5px] text-[var(--fg)] outline-none">
              <option value="featured">Featured</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
          </label>
        </div>
      </div>
      {shown.length === 0
        ? <div className="py-16 text-center text-[var(--muted)]">Nothing matches these filters.</div>
        : <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">{shown.map((p) => <ProductCard key={p.id} slug={slug} product={p} />)}</div>}
    </>
  );
}
