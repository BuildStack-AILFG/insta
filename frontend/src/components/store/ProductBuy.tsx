"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import type { PublicProduct, PublicStore } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { addToCart } from "./cart";

const MAX_QTY = 10;

/** Pick size / colour and quantity, then add to the cart or go straight to checkout. */
export default function ProductBuy({ store, product, refToken }: { store: PublicStore; product: PublicProduct; refToken?: string }) {
  const router = useRouter();
  const groups = product.options;
  const [picked, setPicked] = useState<Record<string, string>>(() => {
    // Preselect when there's only one value (or only one variant left).
    const live = product.variants.filter((v) => !v.sold_out);
    return live.length === 1 ? { ...live[0].options } : Object.fromEntries(groups.filter((g) => g.values.length === 1).map((g) => [g.name, g.values[0]]));
  });
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const variant = groups.length ? product.variants.find((v) => groups.every((g) => v.options[g.name] === picked[g.name])) ?? null : null;
  const complete = groups.every((g) => picked[g.name]);
  const price = variant?.price ?? product.price;
  // A value is offered if some variant with it (and the other picks) exists and isn't sold out.
  const possible = (group: string, value: string) => product.variants.some((v) => v.options[group] === value && !v.sold_out &&
    groups.every((g) => g.name === group || !picked[g.name] || v.options[g.name] === picked[g.name]));
  const soldOut = complete && groups.length > 0 && (!variant || variant.sold_out);
  const ready = complete && !soldOut && store.payment_methods.length > 0;

  const add = (go: boolean) => {
    if (!ready) return;
    addToCart(store.slug, { product_id: product.id, variant_id: variant?.id ?? null, qty, name: product.name, variant: variant?.title ?? null, price, image_url: product.image_url }, refToken);
    if (go) router.push(`/s/${store.slug}/cart`);
    else { setAdded(true); setTimeout(() => setAdded(false), 2000); }
  };

  if (store.payment_methods.length === 0) {
    return <div className="rounded-xl border border-white/15 px-4 py-3 text-[14px] text-white/70">This store isn&apos;t taking orders right now.{store.instagram && <> DM <b>@{store.instagram}</b> to order.</>}</div>;
  }
  return (
    <div className="space-y-5">
      {groups.length > 0 && variant && <div className="text-[20px] font-bold">{fmtMoney(price)}</div>}
      {groups.map((g) => (
        <div key={g.name}>
          <div className="mb-2 text-[13px] text-white/60">{g.name}{picked[g.name] && <>: <b className="text-white">{picked[g.name]}</b></>}</div>
          <div className="flex flex-wrap gap-2">{g.values.map((value) => {
            const on = picked[g.name] === value;
            const ok = possible(g.name, value);
            return (
              <button key={value} onClick={() => setPicked((p) => ({ ...p, [g.name]: on ? "" : value }))} disabled={!ok && !on}
                className={`min-w-[44px] rounded-xl border px-3.5 py-2 text-[13.5px] transition ${on ? "border-pink-400 bg-pink-500/15 text-white" : ok ? "border-white/20 text-white/85 hover:border-white/40" : "border-white/10 text-white/25 line-through"}`}>
                {value}
              </button>
            );
          })}</div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <span className="text-[13px] text-white/60">Quantity</span>
        <div className="flex items-center rounded-full border border-white/15">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-2 text-white/70 hover:text-white disabled:opacity-30" disabled={qty <= 1} aria-label="Fewer"><Minus size={14} /></button>
          <span className="w-8 text-center text-[14px] font-semibold">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} className="p-2 text-white/70 hover:text-white disabled:opacity-30" disabled={qty >= MAX_QTY} aria-label="More"><Plus size={14} /></button>
        </div>
      </div>
      {soldOut && <div className="text-[13px] text-amber-200">This combination is sold out — try another.</div>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <button onClick={() => add(false)} disabled={!ready}
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 py-3.5 text-[15px] font-semibold transition hover:border-white/40 disabled:opacity-40">
          {added ? <><Check size={16} /> Added</> : <><ShoppingBag size={16} /> Add to cart</>}
        </button>
        <button onClick={() => add(true)} disabled={!ready}
          className="rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-600 px-5 py-3.5 text-[15px] font-semibold shadow-[0_10px_30px_rgba(236,72,153,0.35)] transition hover:brightness-110 disabled:opacity-40">
          Buy now · {fmtMoney(price * qty)}
        </button>
      </div>
      {!complete && <p className="text-[12.5px] text-white/50">Choose {groups.filter((g) => !picked[g.name]).map((g) => g.name.toLowerCase()).join(" and ")} to continue.</p>}
    </div>
  );
}
