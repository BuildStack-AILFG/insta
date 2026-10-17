"use client";

import { Plus } from "lucide-react";
import type { PublicProduct } from "@/lib/api";
import { isSample } from "@/lib/store/sample";
import { addToCart, openCartDrawer } from "./cart";

/**
 * Add to cart straight from a product card (niche templates only — hidden by CSS on the classic template). Products with sizes or colours show a
 * "Select options" pill instead; the card's own link takes the buyer to the product page to choose.
 */
export default function QuickAdd({ slug, product: p }: { slug: string; product: PublicProduct }) {
  if (p.sold_out || isSample(p.id)) return null;
  if (p.options.length > 0) {
    return <span className="qa pointer-events-none absolute bottom-2.5 right-2.5 rounded-full bg-[var(--bg)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--fg)] shadow">Select options</span>;
  }
  return (
    <button type="button" aria-label={`Add ${p.name} to cart`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart(slug, { product_id: p.id, variant_id: null, qty: 1, name: p.name, variant: null, price: p.price, image_url: p.image_url });
        openCartDrawer();
      }}
      className="qa absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] shadow-lg transition hover:scale-105">
      <Plus size={18} />
    </button>
  );
}
