"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { errorMessage, storefront, type ShopInvoice } from "@/lib/api";
import { fmtMoney } from "@/lib/money";

export default function InvoicePage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white text-neutral-500"><Loader2 className="animate-spin" /></div>}><InvoiceView /></Suspense>;
}

const money = (v: number) => fmtMoney(v).replace("₹", "₹ ");

/** A printable invoice (Ctrl+P → Save as PDF). Always light, whatever the site theme. */
function InvoiceView() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const token = useSearchParams().get("t") ?? "";
  const [inv, setInv] = useState<ShopInvoice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { storefront.invoice(slug, id, token).then(setInv, (e) => setErr(errorMessage(e, "We couldn't find this invoice."))); }, [slug, id, token]);

  if (err) return <main className="flex min-h-screen items-center justify-center bg-white px-4 text-center text-neutral-600">{err}</main>;
  if (!inv) return <main className="flex min-h-screen items-center justify-center bg-white text-neutral-500"><Loader2 className="animate-spin" /></main>;
  const tax = inv.kind === "tax_invoice";
  const a = inv.buyer.address;
  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-900 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl justify-end print:hidden">
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-700"><Printer size={14} /> Print / Save as PDF</button>
      </div>
      <article className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-5">
          <div>
            <div className="text-[20px] font-bold">{inv.seller.name}</div>
            {inv.seller.store !== inv.seller.name && <div className="text-[13px] text-neutral-500">{inv.seller.store}</div>}
            {inv.seller.address && <div className="mt-1 max-w-xs whitespace-pre-line text-[12.5px] text-neutral-600">{inv.seller.address}</div>}
            {inv.seller.gstin && <div className="mt-1 text-[12.5px]">GSTIN: <b>{inv.seller.gstin}</b>{inv.seller.state && ` · ${inv.seller.state}`}</div>}
            {inv.seller.phone && <div className="text-[12.5px] text-neutral-600">{inv.seller.phone}</div>}
          </div>
          <div className="text-right">
            <div className="text-[18px] font-bold uppercase tracking-wide">{tax ? "Tax invoice" : "Invoice"}</div>
            <div className="mt-1 text-[12.5px] text-neutral-600">No. <b className="text-neutral-900">{inv.number}</b></div>
            <div className="text-[12.5px] text-neutral-600">Date {new Date(inv.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
            <div className="text-[12.5px] text-neutral-600">Order #{inv.order_number}</div>
          </div>
        </header>

        <section className="grid gap-4 border-b border-neutral-200 py-5 text-[12.5px] sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Bill to / Ship to</div>
            <div className="font-semibold">{inv.buyer.name}</div>
            <div className="text-neutral-600">{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", ")}</div>
            <div className="text-neutral-600">{inv.buyer.phone}{inv.buyer.email && ` · ${inv.buyer.email}`}</div>
          </div>
          {tax && <div className="sm:text-right"><div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Place of supply</div><div>{inv.place_of_supply}</div></div>}
        </section>

        <table className="mt-4 w-full text-[12.5px]">
          <thead className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-2 font-semibold">Item</th><th className="font-semibold">Qty</th><th className="text-right font-semibold">Rate</th>
              {tax && <><th className="text-right font-semibold">Taxable</th>{inv.intra_state
                ? <><th className="text-right font-semibold">CGST {inv.gst_rate / 2}%</th><th className="text-right font-semibold">SGST {inv.gst_rate / 2}%</th></>
                : <th className="text-right font-semibold">IGST {inv.gst_rate}%</th>}</>}
              <th className="text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>{inv.lines.map((l, i) => (
            <tr key={i} className="border-b border-neutral-100">
              <td className="py-2 pr-2">{l.name}</td><td>{l.qty}</td><td className="text-right">{money(l.rate)}</td>
              {tax && <><td className="text-right">{money(l.taxable)}</td>{inv.intra_state ? <><td className="text-right">{money(l.cgst)}</td><td className="text-right">{money(l.sgst)}</td></> : <td className="text-right">{money(l.igst)}</td>}</>}
              <td className="text-right font-medium">{money(l.total)}</td>
            </tr>
          ))}</tbody>
        </table>

        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-[13px]">
          {tax && <>
            <div className="flex justify-between text-neutral-600"><span>Taxable value</span><span>{money(inv.totals.taxable)}</span></div>
            {inv.intra_state
              ? <><div className="flex justify-between text-neutral-600"><span>CGST</span><span>{money(inv.totals.cgst)}</span></div><div className="flex justify-between text-neutral-600"><span>SGST</span><span>{money(inv.totals.sgst)}</span></div></>
              : <div className="flex justify-between text-neutral-600"><span>IGST</span><span>{money(inv.totals.igst)}</span></div>}
          </>}
          <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-[15px] font-bold"><span>Total</span><span>{money(inv.totals.total)}</span></div>
          <div className="text-right text-[11.5px] text-neutral-500">
            {inv.payment.method === "cod" ? (inv.payment.status === "paid" ? "Paid in cash on delivery" : "To be paid in cash on delivery") : "Paid online"}
          </div>
        </div>

        <footer className="mt-8 border-t border-neutral-200 pt-4 text-[11px] text-neutral-500">
          {tax ? "Prices are inclusive of GST. " : inv.seller.gstin ? "Bill of supply. " : "Not a tax invoice — the seller is not registered for GST. "}This is a computer-generated invoice and does not need a signature.
        </footer>
      </article>
    </main>
  );
}
