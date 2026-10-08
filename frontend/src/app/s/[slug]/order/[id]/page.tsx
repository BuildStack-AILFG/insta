"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Loader2, PackageCheck, Truck, XCircle } from "lucide-react";
import StoreShell from "@/components/store/StoreShell";
import { itemLabel, storefront, type PublicOrder, type PublicStore } from "@/lib/api";
import { fmtMoney } from "@/lib/money";

const POLL_MS = 4000;
const POLL_FOR_MS = 3 * 60 * 1000; // after this, a still-pending payment needs the customer to act

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="theme-fixed flex min-h-screen items-center justify-center bg-black text-white/60"><Loader2 className="animate-spin" /></div>}>
      <OrderStatus />
    </Suspense>
  );
}

const STEPS: { id: PublicOrder["status"]; label: string; icon: typeof CheckCircle2 }[] = [
  { id: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { id: "shipped", label: "Shipped", icon: Truck },
  { id: "delivered", label: "Delivered", icon: PackageCheck },
];

/** Where Razorpay sends the buyer back to (and the link in the confirmation DM). Polls while the payment is still being confirmed. */
function OrderStatus() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const token = useSearchParams().get("t") ?? "";
  const [data, setData] = useState<{ store: PublicStore; order: PublicOrder } | null>(null);
  const [missing, setMissing] = useState(false);
  const started = useRef<number | null>(null);

  const load = useCallback(() => storefront.order(slug, id, token).then(setData, () => setMissing(true)), [slug, id, token]);

  useEffect(() => { void load(); }, [load]);
  const pending = data?.order.payment_status === "pending";
  useEffect(() => {
    if (!pending) return;
    started.current ??= Date.now();
    const t = setInterval(() => { if (Date.now() - started.current! < POLL_FOR_MS) void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [pending, load]);

  if (missing) {
    return <main className="theme-fixed flex min-h-screen items-center justify-center bg-black px-4 text-center text-white/70">We couldn&apos;t find this order. Check the link in your messages.</main>;
  }
  if (!data) return <main className="theme-fixed flex min-h-screen items-center justify-center bg-black text-white/60"><Loader2 className="animate-spin" /></main>;

  const { store, order } = data;
  const first = order.customer_name.split(" ")[0];
  const stepIndex = STEPS.findIndex((s) => s.id === order.status);
  return (
    <StoreShell store={store}>
      <div className="mx-auto mt-8 max-w-lg">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
          {order.status === "cancelled" || order.status === "returned" ? (
            <><XCircle className="mx-auto text-red-300" size={44} />
              <h1 className="mt-3 text-[20px] font-bold">Order #{order.number} was {order.status === "returned" ? "returned to the seller" : "cancelled"}</h1>
              {order.status === "returned" && store.instagram && <p className="mt-1 text-[13.5px] text-white/60">DM @{store.instagram} if you still want it.</p>}</>
          ) : pending ? (
            <>
              <Clock className="mx-auto text-amber-300" size={44} />
              <h1 className="mt-3 text-[20px] font-bold">Waiting for your payment</h1>
              <p className="mt-1 text-[13.5px] text-white/60">If you&apos;ve just paid, this updates in a few seconds.</p>
              {order.pay_url && <a href={order.pay_url} className="mt-4 inline-block rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-600 px-5 py-3 text-[14px] font-semibold">Pay {fmtMoney(order.total)}</a>}
            </>
          ) : (
            <>
              <CheckCircle2 className="mx-auto text-emerald-300" size={44} />
              <h1 className="mt-3 text-[20px] font-bold">Thank you, {first}! 🎉</h1>
              <p className="mt-1 text-[13.5px] text-white/60">
                {order.status === "new" && order.payment_method === "cod"
                  ? `Order #${order.number} is placed — please tap “Confirm order” in the message we sent you on Instagram. Pay ${fmtMoney(order.total)} on delivery.`
                  : `Order #${order.number} is confirmed${order.payment_method === "cod" ? ` — pay ${fmtMoney(order.total)} on delivery` : " and paid"}.`}
              </p>
            </>
          )}
          {!pending && order.status !== "cancelled" && order.status !== "returned" && (
            <div className="mt-6 flex items-center justify-between">
              {STEPS.map((s, i) => (
                <div key={s.id} className={`flex flex-1 flex-col items-center gap-1 text-[11.5px] ${i <= stepIndex ? "text-pink-200" : "text-white/35"}`}>
                  <s.icon size={18} />{s.label}
                </div>
              ))}
            </div>
          )}
          {(order.awb || order.courier) && order.status === "shipped" && (
            <div className="mt-5 rounded-xl bg-white/[0.06] px-4 py-3 text-left text-[13px]">
              <div className="text-white/80">{order.courier ?? "Courier"}{order.awb && <> · AWB <b>{order.awb}</b></>}</div>
              {order.courier_status && <div className="text-[12px] text-white/50">Latest: {order.courier_status.toLowerCase()}</div>}
              {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-pink-500/90 px-3 py-1.5 text-[12.5px] font-semibold"><Truck size={13} /> Track parcel</a>}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-[13.5px]">
          {order.items.map((it) => (
            <div key={it.product_id} className="flex items-center gap-3">
              {it.image_url ? <img src={it.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-white/10" />}
              <div className="min-w-0 flex-1"><div className="truncate">{itemLabel(it)}</div><div className="text-[12px] text-white/50">Qty {it.qty}</div></div>
              <div>{fmtMoney(it.price * it.qty)}</div>
            </div>
          ))}
          <div className="flex justify-between border-t border-white/10 pt-2 text-white/60"><span>Delivery</span><span>{order.shipping ? fmtMoney(order.shipping) : "Free"}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span>{fmtMoney(order.total)}</span></div>
          <div className="border-t border-white/10 pt-2 text-[12.5px] text-white/55">
            Delivering to {order.customer_name}, {[order.address.line1, order.address.line2, order.address.city, order.address.state, order.address.pincode].filter(Boolean).join(", ")}
          </div>
        </div>
        {order.has_invoice && (
          <a href={`/s/${store.slug}/invoice/${id}?t=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer" className="mt-4 block text-center text-[13px] text-white/60 hover:text-white">
            Download invoice
          </a>
        )}
        <Link href={`/s/${store.slug}`} className="mt-3 block text-center text-[13px] text-pink-300 hover:underline">Continue shopping</Link>
      </div>
    </StoreShell>
  );
}
