"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import type { PublicStore } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { CART_OPEN_EVENT, setQty, useCart } from "./cart";

/** A slide-out cart for the niche templates: opens from the header cart icon or after "quick add", with checkout one tap away. */
export default function CartDrawer({ store }: { store: PublicStore }) {
  const [open, setOpen] = useState(false);
  const cart = useCart(store.slug);
  const count = cart.lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = cart.lines.reduce((n, l) => n + l.price * l.qty, 0);
  const free = store.free_shipping_above;

  useEffect(() => {
    const show = () => setOpen(true);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener(CART_OPEN_EVENT, show);
    document.addEventListener("keydown", esc);
    return () => { window.removeEventListener(CART_OPEN_EVENT, show); document.removeEventListener("keydown", esc); };
  }, []);

  return (
    <div className={`fixed inset-0 z-[70] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside role="dialog" aria-label="Your cart" className={`absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col bg-[var(--bg)] text-[var(--fg)] shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-[17px] font-bold">Your cart{count > 0 && <span className="ml-1.5 text-[14px] font-normal text-[var(--muted)]">({count})</span>}</h2>
          <button onClick={() => setOpen(false)} aria-label="Close cart" className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--soft)] hover:text-[var(--fg)]"><X size={18} /></button>
        </div>

        {cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[var(--muted)]">
            <ShoppingBag size={30} />
            <p>Your cart is empty.</p>
            <button onClick={() => setOpen(false)} className="text-[14px] font-medium text-[var(--accent)] hover:underline">Keep shopping</button>
          </div>
        ) : (
          <>
            {free !== null && free > 0 && (
              <div className="border-b border-[var(--line)] px-5 py-3 text-[12.5px]">
                {subtotal >= free ? <span className="font-medium text-[var(--accent)]">You&apos;ve unlocked free delivery 🎉</span> : <span className="text-[var(--muted)]">Add <b className="text-[var(--fg)]">{fmtMoney(free - subtotal)}</b> more for free delivery</span>}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--soft)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.min(100, (subtotal / free) * 100)}%` }} /></div>
              </div>
            )}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {cart.lines.map((l) => (
                <div key={`${l.product_id}:${l.variant_id ?? ""}`} className="flex gap-3">
                  {l.image_url ? <img src={l.image_url} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" /> : <div className="h-20 w-16 shrink-0 rounded-lg bg-[var(--soft)]" />}
                  <div className="min-w-0 flex-1">
                    <Link href={`/s/${store.slug}/p/${l.product_id}`} onClick={() => setOpen(false)} className="line-clamp-2 text-[14px] font-medium leading-snug hover:underline">{l.name}</Link>
                    {l.variant && <div className="text-[12.5px] text-[var(--muted)]">{l.variant}</div>}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-full border border-[var(--line)]">
                        <button onClick={() => setQty(store.slug, l, l.qty - 1)} className="p-1.5 text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Fewer">{l.qty > 1 ? <Minus size={13} /> : <Trash2 size={13} />}</button>
                        <span className="w-6 text-center text-[13px] font-semibold">{l.qty}</span>
                        <button onClick={() => setQty(store.slug, l, l.qty + 1)} disabled={l.qty >= 10} className="p-1.5 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30" aria-label="More"><Plus size={13} /></button>
                      </div>
                      <span className="text-[14px] font-semibold">{fmtMoney(l.price * l.qty)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--line)] px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-[15px]"><span className="text-[var(--muted)]">Subtotal</span><span className="font-bold">{fmtMoney(subtotal)}</span></div>
              <Link href={`/s/${store.slug}/cart`} onClick={() => setOpen(false)} className="flex w-full items-center justify-center rounded-full bg-[var(--accent)] px-5 py-3.5 text-[15px] font-semibold text-[var(--accent-fg)] transition hover:brightness-95">Checkout</Link>
              <p className="mt-2 text-center text-[11.5px] text-[var(--faint)]">Delivery and payment are chosen at checkout.</p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
