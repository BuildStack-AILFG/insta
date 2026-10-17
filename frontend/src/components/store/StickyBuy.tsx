"use client";

import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";

/** Mobile product pages: once the buy buttons scroll out of view, a bar with the price keeps "Choose options / Buy" one tap away. */
export default function StickyBuy({ targetId, name, price, label }: { targetId: string; name: string; price: string; label: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setOn(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);
  return (
    <div className={`st-stickybuy border-t border-[var(--line)] bg-[var(--bg)] px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] ${on ? "st-on" : ""}`} aria-hidden={!on}>
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-[var(--muted)]">{name}</div>
          <div className="text-[16px] font-bold">{price}</div>
        </div>
        <button onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" })} tabIndex={on ? 0 : -1}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-[14px] font-semibold text-[var(--accent-fg)]">
          <ShoppingBag size={15} /> {label}
        </button>
      </div>
    </div>
  );
}
