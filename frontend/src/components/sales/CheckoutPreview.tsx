"use client";

import { useState } from "react";
import { Banknote, CreditCard, Landmark, Lock, QrCode, Smartphone } from "lucide-react";
import { Button, cx, Modal } from "@/components/ui/kit";
import type { BillingQuote } from "@/lib/api";
import { fmtMoney } from "@/lib/money";

const METHODS = [
  { id: "upi", label: "UPI", hint: "Google Pay, PhonePe, Paytm", icon: Smartphone },
  { id: "card", label: "Cards", hint: "Visa, Mastercard, RuPay", icon: CreditCard },
  { id: "netbanking", label: "Netbanking", hint: "All major banks", icon: Landmark },
  { id: "wallet", label: "Wallets", hint: "Paytm, Mobikwik & more", icon: Banknote },
] as const;

/**
 * A wireframe of the Razorpay Checkout window, shown while the platform's Razorpay keys aren't configured yet (Billing overview `enabled: false`).
 * It uses the real quote (plan, period, GST, total) but never charges anything (a small Preview tag and the note after pressing Pay say so); once RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set on the server,
 * BillingTab opens the real Razorpay window instead and this component is no longer reached.
 */
export default function CheckoutPreview({ quote, currency, businessName, onClose }: { quote: BillingQuote; currency: string; businessName: string; onClose: () => void }) {
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("upi");
  const [tried, setTried] = useState(false);
  const m = (n: number) => fmtMoney(n, currency);

  return (
    <Modal open onClose={onClose} title="Checkout" width={520}
      footer={<Button variant="ghost" onClick={onClose}>Close preview</Button>}>
      <div className="space-y-4">

        {/* The look of a payment window: fixed light card in both themes, like the invoice. */}
        <div className="theme-fixed overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-800 shadow-lg">
          <div className="flex items-center justify-between gap-3 bg-[#0B2A5B] px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[17px] font-extrabold text-[#0B2A5B]">{businessName.charAt(0)}</span>
              <div>
                <p className="text-[14.5px] font-semibold leading-tight">{businessName}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-white/70"><Lock size={11} /> Secure payment <span className="rounded bg-amber-400 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#0B2A5B]">Preview</span></p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-white/60">Total</p>
              <p className="text-[19px] font-bold leading-tight">{m(quote.total)}</p>
            </div>
          </div>

          <div className="border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-[12.5px]">
            <div className="flex justify-between"><span className="font-medium text-neutral-900">{quote.plan_name} plan · {quote.months} month{quote.months === 1 ? "" : "s"}</span><span>{m(quote.base)}</span></div>
            {quote.credit > 0 && <div className="flex justify-between text-emerald-700"><span>Credit for unused time</span><span>−{m(quote.credit)}</span></div>}
            <div className="flex justify-between text-neutral-500"><span>GST ({quote.gst_percent}%)</span><span>{m(quote.gst)}</span></div>
          </div>

          <div className="grid grid-cols-[150px_1fr]">
            <div className="border-r border-neutral-200 bg-neutral-50/60">
              {METHODS.map((x) => (
                <button key={x.id} type="button" onClick={() => setMethod(x.id)} className={cx("flex w-full items-center gap-2 border-b border-neutral-200 px-3 py-3 text-left text-[13px] transition", method === x.id ? "bg-white font-semibold text-neutral-900 shadow-[inset_3px_0_0_#3395FF]" : "text-neutral-600 hover:bg-white")}>
                  <x.icon size={15} className="shrink-0" /> {x.label}
                </button>
              ))}
            </div>
            <div className="min-h-[190px] p-4 text-[13px]">
              <p className="mb-3 text-[12px] text-neutral-500">{METHODS.find((x) => x.id === method)!.hint}</p>
              {method === "upi" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-neutral-300 p-3"><QrCode size={42} className="text-neutral-400" /><span className="text-[12px] text-neutral-500">Scan with any UPI app to pay</span></div>
                  <input disabled placeholder="Or enter your UPI ID  (name@bank)" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-[13px]" />
                </div>
              )}
              {method === "card" && (
                <div className="space-y-2">
                  <input disabled placeholder="Card number" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-[13px]" />
                  <div className="grid grid-cols-2 gap-2"><input disabled placeholder="MM / YY" className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-[13px]" /><input disabled placeholder="CVV" className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-[13px]" /></div>
                </div>
              )}
              {method === "netbanking" && <div className="grid grid-cols-2 gap-2">{["HDFC", "ICICI", "SBI", "Axis"].map((b) => <span key={b} className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-center text-[12.5px] text-neutral-600">{b}</span>)}</div>}
              {method === "wallet" && <div className="grid grid-cols-2 gap-2">{["Paytm", "Mobikwik", "Freecharge", "Amazon Pay"].map((b) => <span key={b} className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-center text-[12.5px] text-neutral-600">{b}</span>)}</div>}
            </div>
          </div>

          <div className="border-t border-neutral-200 p-4">
            <button type="button" onClick={() => setTried(true)} className="w-full rounded-lg bg-[#3395FF] py-3 text-[14.5px] font-semibold text-white transition hover:bg-[#2A85E8]">Pay {m(quote.total)}</button>
            {tried && <p className="mt-2 text-center text-[12px] font-medium text-amber-700">Preview mode — nothing was charged. Real payments start once Razorpay is connected.</p>}
            <p className="mt-2 text-center text-[11px] text-neutral-400">Payments are processed securely by Razorpay</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
