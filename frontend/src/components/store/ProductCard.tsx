import Link from "next/link";
import type { PublicProduct } from "@/lib/api";
import { fmtMoney } from "@/lib/money";

/** A product tile: photo (the second photo shows on hover), name, price with MRP and discount, sold-out badge. */
export default function ProductCard({ slug, product: p, className = "" }: { slug: string; product: PublicProduct; className?: string }) {
  const off = !p.price_varies && p.compare_at_price && p.compare_at_price > p.price ? Math.round(100 - (100 * p.price) / p.compare_at_price) : 0;
  const second = p.images[1];
  return (
    <Link href={`/s/${slug}/p/${p.id}`} className={`group block ${className}`}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--soft)]">
        {p.image_url && <img src={p.image_url} alt={p.name} loading="lazy" className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] ${second ? "group-hover:opacity-0" : ""}`} />}
        {second && <img src={second} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />}
        <div className="absolute left-2.5 top-2.5 flex flex-col gap-1.5">
          {p.sold_out && <span className="rounded-full bg-neutral-900/85 px-2.5 py-1 text-[11px] font-semibold text-white">Sold out</span>}
          {!p.sold_out && off >= 5 && <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-fg)]">{off}% off</span>}
        </div>
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="line-clamp-2 text-[14px] font-medium leading-snug text-[var(--fg)] group-hover:text-[var(--fg)]">{p.name}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          {p.price_varies && <span className="text-[12px] text-[var(--muted)]">From</span>}
          <span className="text-[15px] font-bold text-[var(--fg)]">{fmtMoney(p.price)}</span>
          {off > 0 && <span className="text-[12.5px] text-[var(--faint)] line-through">{fmtMoney(p.compare_at_price!)}</span>}
        </div>
        {p.options.length > 0 && <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">{p.options.map((o) => `${o.values.length} ${o.name.toLowerCase()}s`).join(" · ")}</div>}
      </div>
    </Link>
  );
}
