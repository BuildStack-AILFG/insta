import { fmtMoney } from "@/lib/money";

/** The product page price: "From ₹X" until a variant is chosen, then its exact price; MRP and discount only when the price is the same for every variant. */
export default function PriceBlock({ price, from = false, compareAt = null }: { price: number; from?: boolean; compareAt?: number | null }) {
  const off = compareAt && compareAt > price ? Math.round(100 - (100 * price) / compareAt) : 0;
  return (
    <div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2.5">
        {from && <span className="text-[15px] text-[var(--muted)]">From</span>}
        <span className="text-[26px] font-bold">{fmtMoney(price)}</span>
        {off > 0 && <>
          <span className="text-[16px] text-[var(--faint)] line-through">{fmtMoney(compareAt!)}</span>
          <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg))] px-2.5 py-0.5 text-[13px] font-semibold text-[var(--accent)]">{off}% off</span>
        </>}
      </div>
      <p className="mt-1 text-[12.5px] text-[var(--muted)]">Inclusive of all taxes</p>
    </div>
  );
}
