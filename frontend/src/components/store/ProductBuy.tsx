"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, MessageCircle, Minus, Phone, Plus, ShoppingBag } from "lucide-react";
import type { PublicProduct, PublicStore } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { addToCart } from "./cart";
import BookingForm from "./BookingForm";
import PriceBlock from "./PriceBlock";

const MAX_QTY = 10;

/** Pick size / colour and quantity, then add to the cart or go straight to checkout. */
export default function ProductBuy({ store, product, refToken, sizeGuide }: { store: PublicStore; product: PublicProduct; refToken?: string; sizeGuide?: string }) {
  const router = useRouter();
  const groups = product.options;
  const [picked, setPicked] = useState<Record<string, string>>(() => {
    // Preselect when there's only one value (or only one variant left).
    const live = product.variants.filter((v) => !v.sold_out);
    return live.length === 1 ? { ...live[0].options } : Object.fromEntries(groups.filter((g) => g.values.length === 1).map((g) => [g.name, g.values[0]]));
  });
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [booking, setBooking] = useState(false);

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

  // Hotels & venues take enquiries, not cart orders: call, or message on WhatsApp with the service name filled in.
  if (store.site.template === "hotel") {
    const digits = (store.support_phone ?? "").replace(/\D/g, "");
    const wa = digits ? `https://wa.me/${digits.length === 10 ? "91" + digits : digits}?text=${encodeURIComponent(`Hi, I'd like to enquire about "${product.name}" at ${store.name}. My event date is: `)}` : null;
    const btn = "flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[15px] font-semibold transition";
    return (
      <div className="space-y-5">
        <PriceBlock price={product.price} from compareAt={product.compare_at_price} />
        <button onClick={() => setBooking(true)} className={`${btn} w-full bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-95`}><CalendarCheck size={16} /> {store.site.texts.book_now}</button>
        {booking && <BookingForm store={store} product={product} onClose={() => setBooking(false)} />}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {digits && <a href={`tel:+${digits.length === 10 ? "91" + digits : digits}`} className={`${btn} border border-[var(--line)] hover:border-[var(--muted)]`}><Phone size={16} /> {store.site.texts.add_to_cart}</a>}
          {wa && <a href={wa} target="_blank" rel="noreferrer" className={`${btn} border border-[var(--line)] hover:border-[var(--muted)]`}><MessageCircle size={16} /> {store.site.texts.buy_now}</a>}
        </div>
        {!digits && store.instagram && <div className="rounded-xl border border-[var(--line)] px-4 py-3 text-[14px] text-[var(--muted)]">DM <b>@{store.instagram}</b> to enquire.</div>}
        <p className="text-[12.5px] text-[var(--muted)]">Prices are indicative. Tell us your date and guest count and we&apos;ll confirm availability and a final quote.</p>
      </div>
    );
  }
  if (store.payment_methods.length === 0) {
    return <div className="rounded-xl border border-[var(--line)] px-4 py-3 text-[14px] text-[var(--muted)]">This store isn&apos;t taking orders right now.{store.instagram && <> DM <b>@{store.instagram}</b> to order.</>}</div>;
  }
  return (
    <div className="space-y-5">
      <PriceBlock price={price} from={product.price_varies && !variant} compareAt={product.price_varies ? null : product.compare_at_price} />
      {groups.map((g) => (
        <div key={g.name}>
          <div className="mb-2 flex items-center justify-between text-[13px] text-[var(--muted)]">
            <span>{g.name}{picked[g.name] && <>: <b className="text-[var(--fg)]">{picked[g.name]}</b></>}</span>
            {sizeGuide && /size/i.test(g.name) && <button type="button" onClick={() => setGuideOpen(true)} className="text-[12.5px] font-medium text-[var(--fg)] underline underline-offset-2">Size guide</button>}
          </div>
          <div className="flex flex-wrap gap-2">{g.values.map((value) => {
            const on = picked[g.name] === value;
            const ok = possible(g.name, value);
            return (
              <button key={value} onClick={() => setPicked((p) => ({ ...p, [g.name]: on ? "" : value }))} disabled={!ok && !on}
                className={`min-w-[44px] rounded-xl border px-3.5 py-2 text-[13.5px] transition ${on ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg))] text-[var(--fg)]" : ok ? "border-[var(--line)] text-[var(--fg)] hover:border-[var(--muted)]" : "border-[var(--line)] text-[var(--faint)] line-through"}`}>
                {value}
              </button>
            );
          })}</div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <span className="text-[13px] text-[var(--muted)]">Quantity</span>
        <div className="flex items-center rounded-full border border-[var(--line)]">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-2 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30" disabled={qty <= 1} aria-label="Fewer"><Minus size={14} /></button>
          <span className="w-8 text-center text-[14px] font-semibold">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} className="p-2 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30" disabled={qty >= MAX_QTY} aria-label="More"><Plus size={14} /></button>
        </div>
      </div>
      {soldOut && <div className="text-[13px] text-amber-700">This combination is sold out — try another.</div>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <button onClick={() => add(false)} disabled={!ready}
          className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] px-5 py-3.5 text-[15px] font-semibold transition hover:border-[var(--muted)] disabled:opacity-40">
          {added ? <><Check size={16} /> Added</> : <><ShoppingBag size={16} /> {store.site.texts.add_to_cart}</>}
        </button>
        <button onClick={() => add(true)} disabled={!ready}
          className="rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] px-5 py-3.5 text-[15px] font-semibold transition hover:brightness-95 disabled:opacity-40">
          {store.site.texts.buy_now} · {fmtMoney(price * qty)}
        </button>
      </div>
      {guideOpen && sizeGuide && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4" onClick={() => setGuideOpen(false)} role="dialog" aria-label="Size guide">
          <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[var(--bg)] p-6 text-[var(--fg)] shadow-2xl">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-bold">Size guide</h2>
              <button onClick={() => setGuideOpen(false)} className="text-[22px] leading-none text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Close">×</button></div>
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-[var(--muted)]">{sizeGuide}</p>
          </div>
        </div>
      )}
      {!complete && <p className="text-[12.5px] text-[var(--muted)]">Choose {groups.filter((g) => !picked[g.name]).map((g) => g.name.toLowerCase()).join(" and ")} to continue.</p>}
    </div>
  );
}
