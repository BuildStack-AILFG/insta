"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { errorMessage, itemLabel, storefront, type CheckoutInput, type PublicStore, type ShopAddress } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { clearCart, type CartLine } from "./cart";

const SAVED = "gfg_buyer"; // remembers the buyer's details on this device for their next order
const field = "w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-[14px] text-[var(--fg)] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:outline-none";

type Buyer = { name: string; phone: string; email: string; address: ShopAddress };
const EMPTY: Buyer = { name: "", phone: "", email: "", address: { line1: "", line2: "", city: "", state: "", pincode: "" } };
const noop = () => () => {};
const readSaved = () => { try { return window.localStorage.getItem(SAVED); } catch { return null; } };

/** Delivery details + payment for the cart's lines. The server re-prices every line; the figures here are a preview. */
export default function CheckoutForm({ store, lines, refToken }: { store: PublicStore; lines: CartLine[]; refToken?: string | null }) {
  const router = useRouter();
  const savedRaw = useSyncExternalStore(noop, readSaved, () => null);
  const saved = useMemo<Buyer | null>(() => {
    try { return savedRaw ? { ...EMPTY, ...JSON.parse(savedRaw) } : null; } catch { return null; }
  }, [savedRaw]);
  const [edited, setEdited] = useState<Buyer | null>(null);
  const b = edited ?? saved ?? EMPTY;
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<"online" | "cod">(store.payment_methods[0] ?? "online");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const shipping = store.free_shipping_above !== null && subtotal >= store.free_shipping_above ? 0 : store.shipping_fee;
  const total = subtotal + shipping;
  const setB = (next: Buyer) => setEdited(next);
  const setAddr = (p: Partial<ShopAddress>) => setEdited({ ...b, address: { ...b.address, ...p } });

  const problem = !b.name.trim() ? "Enter your name"
    : b.phone.replace(/\D/g, "").length < 10 ? "Enter your 10-digit mobile number"
    : b.address.line1.trim().length < 3 ? "Enter your address"
    : !b.address.city.trim() || !b.address.state.trim() ? "Enter your city and state"
    : !/^[1-9][0-9]{5}$/.test(b.address.pincode) ? "Enter a 6-digit pincode" : null;

  const submit = async () => {
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    const body: CheckoutInput = {
      items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, qty: l.qty })), name: b.name.trim(), phone: b.phone.trim(),
      email: b.email.trim() || undefined, note: note.trim(), payment_method: method, ref: refToken ?? undefined,
      address: { line1: b.address.line1.trim(), line2: b.address.line2?.trim() ?? "", city: b.address.city.trim(), state: b.address.state.trim(), pincode: b.address.pincode },
    };
    try {
      const r = await storefront.checkout(store.slug, body);
      try { window.localStorage.setItem(SAVED, JSON.stringify(b)); } catch { /* storage unavailable */ }
      clearCart(store.slug);
      if (r.pay_url) window.location.assign(r.pay_url);
      else router.push(`/s/${store.slug}/order/${r.order_id}?t=${encodeURIComponent(r.token)}`);
    } catch (e) {
      setErr(errorMessage(e, "Couldn't place the order. Please try again."));
      setBusy(false);
    }
  };

  if (store.payment_methods.length === 0) {
    return <div className="rounded-xl border border-[var(--line)] px-4 py-3 text-[14px] text-[var(--muted)]">This store isn&apos;t taking orders right now.{store.instagram && <> DM <b>@{store.instagram}</b> to order.</>}</div>;
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <h2 className="text-[14px] font-semibold">Delivery details</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <input className={field} placeholder="Full name" autoComplete="name" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
          <input className={field} placeholder="Mobile number" autoComplete="tel" inputMode="tel" value={b.phone} onChange={(e) => setB({ ...b, phone: e.target.value })} />
        </div>
        <input className={field} placeholder="Email (optional, for the receipt)" type="email" autoComplete="email" value={b.email} onChange={(e) => setB({ ...b, email: e.target.value })} />
        <input className={field} placeholder="House no., street, area" autoComplete="address-line1" value={b.address.line1} onChange={(e) => setAddr({ line1: e.target.value })} />
        <input className={field} placeholder="Landmark (optional)" autoComplete="address-line2" value={b.address.line2 ?? ""} onChange={(e) => setAddr({ line2: e.target.value })} />
        <div className="grid grid-cols-3 gap-2.5">
          <input className={field} placeholder="City" autoComplete="address-level2" value={b.address.city} onChange={(e) => setAddr({ city: e.target.value })} />
          <input className={field} placeholder="State" autoComplete="address-level1" value={b.address.state} onChange={(e) => setAddr({ state: e.target.value })} />
          <input className={field} placeholder="Pincode" autoComplete="postal-code" inputMode="numeric" maxLength={6} value={b.address.pincode} onChange={(e) => setAddr({ pincode: e.target.value.replace(/\D/g, "") })} />
        </div>
        <textarea className={field} rows={2} maxLength={500} placeholder="Note for the seller (optional) — size, colour, message on the cake…" value={note} onChange={(e) => setNote(e.target.value)} />
      </section>

      {store.payment_methods.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-[14px] font-semibold">Payment</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["online", "Pay now", "UPI, cards, netbanking", Smartphone], ["cod", "Cash on delivery", "Pay when it arrives", Banknote]] as const).map(([m, title, hint, Icon]) => (
              <button key={m} onClick={() => setMethod(m)}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${method === m ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg))]" : "border-[var(--line)] hover:border-[var(--muted)]"}`}>
                <Icon size={18} className="shrink-0 text-[var(--accent)]" />
                <span><span className="block text-[13.5px] font-semibold">{title}</span><span className="block text-[11.5px] text-[var(--muted)]">{hint}</span></span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-1.5 rounded-xl bg-[var(--surface)] px-4 py-3 text-[13.5px]">
        {lines.map((l) => (
          <div key={`${l.product_id}:${l.variant_id ?? ""}`} className="flex justify-between gap-3 text-[var(--muted)]"><span className="min-w-0 truncate">{itemLabel(l)} × {l.qty}</span><span>{fmtMoney(l.price * l.qty)}</span></div>
        ))}
        <div className="flex justify-between text-[var(--muted)]"><span>Delivery</span><span>{shipping ? fmtMoney(shipping) : "Free"}</span></div>
        <div className="flex justify-between border-t border-[var(--line)] pt-1.5 text-[15px] font-bold"><span>Total</span><span>{fmtMoney(total)}</span></div>
      </section>

      {err && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">{err}</div>}
      <button onClick={submit} disabled={busy || lines.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] px-5 py-4 text-[15.5px] font-semibold transition hover:brightness-95 disabled:opacity-60">
        {busy && <Loader2 size={17} className="animate-spin" />}
        {method === "online" ? `Pay ${fmtMoney(total)}` : `Place order · ${fmtMoney(total)}`}
      </button>
      {method === "online" && <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-[var(--muted)]"><ShieldCheck size={12} /> Secure payment by Razorpay, straight to {store.name}</p>}
    </div>
  );
}
