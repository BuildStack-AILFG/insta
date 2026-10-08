"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import type { PublicStore } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import CheckoutForm from "./CheckoutForm";
import { setQty, useCart } from "./cart";

/** The cart page: edit lines, then the checkout form for all of them. */
export default function CartView({ store }: { store: PublicStore }) {
  const cart = useCart(store.slug);
  if (cart.lines.length === 0) {
    return (
      <div className="mt-16 text-center text-[var(--muted)]">
        <ShoppingBag className="mx-auto mb-3" size={28} />Your cart is empty.
        <Link href={`/s/${store.slug}`} className="mt-4 block text-[14px] text-[var(--accent)] hover:underline">Browse products</Link>
      </div>
    );
  }
  return (
    <div className="mt-6 grid gap-8 md:grid-cols-[1fr_1.1fr]">
      <section>
        <h1 className="mb-3 text-[20px] font-bold">Your cart</h1>
        <div className="space-y-3">{cart.lines.map((l) => (
          <div key={`${l.product_id}:${l.variant_id ?? ""}`} className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-3">
            {l.image_url ? <img src={l.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="h-16 w-16 rounded-xl bg-[var(--soft)]" />}
            <div className="min-w-0 flex-1">
              <Link href={`/s/${store.slug}/p/${l.product_id}`} className="line-clamp-1 text-[14px] font-medium hover:underline">{l.name}</Link>
              {l.variant && <div className="text-[12.5px] text-[var(--muted)]">{l.variant}</div>}
              <div className="mt-1 text-[13.5px] font-semibold">{fmtMoney(l.price * l.qty)}</div>
            </div>
            <div className="flex items-center rounded-full border border-[var(--line)]">
              <button onClick={() => setQty(store.slug, l, l.qty - 1)} className="p-1.5 text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Fewer">{l.qty > 1 ? <Minus size={13} /> : <Trash2 size={13} />}</button>
              <span className="w-6 text-center text-[13px] font-semibold">{l.qty}</span>
              <button onClick={() => setQty(store.slug, l, l.qty + 1)} className="p-1.5 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30" disabled={l.qty >= 10} aria-label="More"><Plus size={13} /></button>
            </div>
          </div>
        ))}</div>
        <Link href={`/s/${store.slug}`} className="mt-4 inline-block text-[13px] text-[var(--accent)] hover:underline">+ Add more items</Link>
      </section>
      <section><CheckoutForm store={store} lines={cart.lines} refToken={cart.ref} /></section>
    </div>
  );
}

/** Header cart icon with the number of items. */
export function CartLink({ slug }: { slug: string }) {
  const n = useCart(slug).lines.reduce((sum, l) => sum + l.qty, 0);
  return (
    <Link href={`/s/${slug}/cart`} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--fg)] hover:bg-[var(--soft)]" aria-label={`Cart, ${n} items`}>
      <ShoppingBag size={19} />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[11px] font-bold text-[var(--accent-fg)]">{n}</span>}
    </Link>
  );
}
