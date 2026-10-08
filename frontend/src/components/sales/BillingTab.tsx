"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, Building2, CalendarClock, Check, FileText, Printer, ShieldCheck, Sparkles } from "lucide-react";
import { Alert, Badge, Button, Card, cx, Field, fmtDateTime, Input, Modal, Select, Spinner, Textarea, useUi } from "@/components/ui/kit";
import { billing, errorMessage, type BillingInterval, type BillingOverview, type BillingProfile, type Invoice } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { useWorkspace } from "@/components/dashboard/WorkspaceContext";
import CheckoutPreview from "./CheckoutPreview";

// Quarterly still exists on the server for existing customers, but the price list is kept simple: monthly or yearly.
const INTERVALS: { id: BillingInterval; label: string }[] = [{ id: "monthly", label: "Monthly" }, { id: "yearly", label: "Yearly" }];
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCtor = new (o: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global { interface Window { Razorpay?: RazorpayCtor } }

function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    const s = existing ?? Object.assign(document.createElement("script"), { src: CHECKOUT_SRC, async: true });
    s.addEventListener("load", () => resolve(true));
    s.addEventListener("error", () => resolve(false));
    if (!existing) document.body.appendChild(s);
  });
}

const QUOTA_LINES: { key: string; label: (n: number) => string }[] = [
  { key: "max_instagram_accounts", label: (n) => `${n.toLocaleString()} Instagram account${n === 1 ? "" : "s"}` },
  { key: "max_team_members", label: (n) => `${n.toLocaleString()} team member${n === 1 ? "" : "s"}` },
  { key: "max_contacts", label: (n) => `${n.toLocaleString()} contacts` },
  { key: "max_comment_automations", label: (n) => `${n.toLocaleString()} comment automations` },
  { key: "max_automation_flows", label: (n) => `${n.toLocaleString()} automation flows` },
  { key: "ai_replies_included_per_month", label: (n) => `${n.toLocaleString()} AI replies / month` },
];

const dateOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function BillingTab() {
  const { toast } = useUi();
  const { refresh } = useWorkspace();
  const params = useSearchParams();
  const wanted = params.get("plan"); // deep link from the pricing page: /dashboard/settings?tab=billing&plan=growth&interval=yearly
  const [o, setO] = useState<BillingOverview | null>(null);
  const [period, setPeriod] = useState<BillingInterval>(params.get("interval") === "monthly" ? "monthly" : "yearly");
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState<{ then?: string } | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  const load = useCallback(async () => { try { setO(await billing.overview()); } catch (e) { setErr(errorMessage(e, "Couldn't load billing.")); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (o && wanted) document.getElementById(`plan-${wanted}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [o, wanted]);

  const pay = async (planId: string) => {
    if (!o) return;
    if (!o.enabled) return setPreview(planId); // Razorpay isn't configured yet: show the checkout wireframe instead of a real payment
    if (!o.profile.legal_name || !o.profile.state_code) return setProfileOpen({ then: planId });
    setBuying(planId);
    setErr(null);
    try {
      const [co, ok] = await Promise.all([billing.checkout(planId, period), loadCheckout()]);
      if (!ok || !window.Razorpay) throw new Error("Couldn't load the secure payment window. Check your connection or ad-blocker and try again.");
      const rz = new window.Razorpay({
        key: co.key_id, order_id: co.order_id, amount: co.amount, currency: co.currency, name: co.name, description: co.description, prefill: co.prefill,
        theme: { color: "#ec4899" }, notes: { workspace_plan: planId },
        modal: { ondismiss: () => setBuying(null) },
        handler: async (r: RazorpayResponse) => {
          try {
            await billing.verify(r);
            toast("Payment received — your plan is active 🎉");
            await Promise.all([load(), refresh()]);
          } catch (e) { setErr(errorMessage(e, "We couldn't confirm your payment yet. If money was deducted your plan will activate shortly, or contact support.")); void load(); }
          setBuying(null);
        },
      });
      rz.on("payment.failed", (r) => { setErr(r.error?.description ?? "The payment didn't go through. You haven't been charged — please try again."); setBuying(null); });
      rz.open();
    } catch (e) {
      setErr(e instanceof Error && !("status" in e) ? e.message : errorMessage(e, "Couldn't start the payment."));
      setBuying(null);
    }
  };

  if (!o) return err ? <Alert>{err}</Alert> : <Spinner />;
  const state = o.plan;
  const current = o.plans.find((p) => p.current);
  const saving = (p: BillingOverview["plans"][number], i: BillingInterval) => { const m = p.per_month.monthly, x = p.per_month[i]; return m && x && x < m ? Math.round((1 - x / m) * 100) : 0; };

  return (
    <div className="space-y-5">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-white/40">Current plan</p>
            <div className="mt-1 flex items-center gap-2.5"><h3 className="text-[20px] font-semibold text-white">{state.id === "trial" ? "Free trial" : current?.name ?? state.id[0].toUpperCase() + state.id.slice(1)}</h3>
              <Badge tone={state.kind === "active" ? "green" : state.kind === "trial" ? "blue" : state.kind === "grace" || state.expired ? "red" : "gray"}>
                {state.kind === "active" ? "Active" : state.kind === "trial" ? "Trial" : state.kind === "grace" ? "Payment overdue" : state.kind === "custom" ? "Custom" : "Free"}
              </Badge></div>
          </div>
          <p className="flex items-center gap-2 text-[13px] text-white/60">
            <CalendarClock size={15} />
            {state.kind === "active" && <>Active until <b className="text-white">{dateOnly(state.ends_at)}</b> · {state.days_left} day{state.days_left === 1 ? "" : "s"} left</>}
            {state.kind === "trial" && (state.expired ? "Your trial has ended — choose a plan to continue" : <><b className="text-white">{state.days_left}</b> day{state.days_left === 1 ? "" : "s"} left in your trial</>)}
            {state.kind === "grace" && <>Ended {dateOnly(state.ends_at)} — renew now to keep your paid features</>}
            {state.kind === "free" && "You're on the free plan. Upgrade to unlock every feature"}
            {state.kind === "custom" && "Managed by our team"}
          </p>
        </div>
      </Card>

      {state.kind === "trial" && !state.expired && (
        <p className="rounded-xl border border-brand/25 bg-brand/[0.07] px-4 py-3 text-[13px] text-white/75">
          You&apos;re on the free trial: comment automations are capped and analytics, reports, auto-assignment, API &amp; webhooks and integrations are locked. Every paid plan unlocks those; Growth also adds the Instagram Shop, giveaways, intent matching, segments and the sales pipeline.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[16px] font-semibold text-white">Choose a plan</h3>
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1" role="tablist" aria-label="Billing period">
          {INTERVALS.map((i) => (
            <button key={i.id} role="tab" aria-selected={period === i.id} onClick={() => setPeriod(i.id)} className={cx("rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition", period === i.id ? "btn-accent bg-brand text-white" : "text-white/60 hover:text-white")}>{i.label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {o.plans.map((p) => {
          const q = p.quotes[period];
          const perMonth = p.per_month[period];
          const off = saving(p, period);
          const popular = p.id === "growth";
          return (
            <div key={p.id} id={`plan-${p.id}`} className={cx("relative flex flex-col rounded-2xl border p-5", p.current ? "border-brand bg-brand/[0.06]" : popular ? "border-brand/50 bg-card" : "border-white/10 bg-card", wanted === p.id && "ring-2 ring-brand")}>
              {popular && !p.current && <span className="absolute -top-2.5 left-5 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white btn-accent">Most popular</span>}
              <div className="flex items-center justify-between"><h4 className="text-[16px] font-semibold text-white">{p.name}</h4>{off > 0 && <Badge tone="green">Save {off}%</Badge>}</div>
              {p.purchasable && perMonth ? (
                <>
                  <p className="mt-3 text-[28px] font-bold tracking-tight text-white">{fmtMoney(perMonth, o.currency)}<span className="text-[13px] font-normal text-white/45"> / month</span></p>
                  <p className="text-[12px] text-white/40">+ {o.gst_percent}% GST · billed {period === "monthly" ? "every month" : period === "quarterly" ? "every 3 months" : "every 12 months"}</p>
                </>
              ) : <p className="mt-3 text-[24px] font-bold text-white">Let&apos;s talk</p>}
              <ul className="mt-4 flex-1 space-y-1.5 text-[13px] text-white/65">
                {p.purchasable && <li className="flex gap-2 font-semibold text-white"><Check size={14} className="mt-0.5 shrink-0 text-brand" />{p.id === "starter" ? "All core features" : "Every feature included"}</li>}
                {QUOTA_LINES.map((l) => p.quotas[l.key] !== undefined && <li key={l.key} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-brand" />{p.quotas[l.key] >= 999999 ? l.label(0).replace(/^0/, "Unlimited") : l.label(p.quotas[l.key])}</li>)}
              </ul>
              {q && (
                <div className="mt-4 rounded-lg bg-white/[0.04] p-3 text-[12px] text-white/55">
                  <div className="flex justify-between"><span>{q.months} month{q.months === 1 ? "" : "s"}</span><span>{fmtMoney(q.base, o.currency)}</span></div>
                  {q.credit > 0 && <div className="flex justify-between text-pink-300"><span>Credit for unused time</span><span>−{fmtMoney(q.credit, o.currency)}</span></div>}
                  <div className="flex justify-between"><span>GST ({q.gst_percent}%)</span><span>{fmtMoney(q.gst, o.currency)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-white/10 pt-1 text-[13px] font-semibold text-white"><span>Total today</span><span>{fmtMoney(q.total, o.currency)}</span></div>
                </div>
              )}
              {p.purchasable ? (
                <Button className="mt-4 w-full" variant={p.current ? "soft" : "primary"} loading={buying === p.id} disabled={!!buying} onClick={() => void pay(p.id)}>
                  {p.current && q?.renewal ? "Renew plan" : p.current ? "Buy again" : state.kind === "active" ? "Switch to this plan" : q ? `Pay ${fmtMoney(q.total, o.currency)} & upgrade` : "Choose plan"}
                </Button>
              ) : (
                <a href="/contact?topic=sales" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-[13.5px] font-medium text-white hover:bg-white/[0.07]"><Sparkles size={14} /> Talk to sales</a>
              )}
            </div>
          );
        })}
      </div>
      <p className="flex items-center gap-2 text-[12px] text-white/40"><ShieldCheck size={14} /> Payments are processed securely by Razorpay — UPI, cards, netbanking and wallets. Plans are prepaid; there are no auto-debits, and you&apos;re emailed before a plan ends.</p>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Building2 size={17} className="text-white/60" /><h3 className="text-[15px] font-semibold text-white">Billing details</h3></div>
          <Button size="sm" variant="ghost" onClick={() => setProfileOpen({})}>{o.profile.legal_name ? "Edit" : "Add details"}</Button>
        </div>
        {o.profile.legal_name ? (
          <div className="text-[13px] leading-relaxed text-white/65"><b className="text-white">{o.profile.legal_name}</b>{o.profile.gstin && <> · GSTIN {o.profile.gstin}</>}<br />{[o.profile.address, o.profile.city, o.states[o.profile.state_code], o.profile.pincode].filter(Boolean).join(", ")}</div>
        ) : <p className="text-[13px] text-white/45">Add your business name, state and (optionally) GSTIN. They appear on your GST invoices so you can claim input tax credit.</p>}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3"><FileText size={17} className="text-white/60" /><h3 className="text-[15px] font-semibold text-white">Invoices</h3></div>
        {o.payments.length === 0 ? <p className="px-5 py-6 text-[13px] text-white/40">Your invoices will appear here after your first payment.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-[11.5px] uppercase tracking-wide text-white/35"><tr><th className="px-5 py-2 font-medium">Invoice</th><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Plan</th><th className="px-3 py-2 font-medium">Period</th><th className="px-3 py-2 text-right font-medium">Amount</th><th className="px-5 py-2" /></tr></thead>
              <tbody>{o.payments.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="px-5 py-3 font-mono text-[12.5px] text-white">{p.invoice_number}</td><td className="px-3 py-3 text-white/60">{dateOnly(p.paid_at)}</td>
                  <td className="px-3 py-3 capitalize text-white/80">{p.plan_id} · {p.months}m</td><td className="px-3 py-3 text-white/50">{dateOnly(p.period_start)} – {dateOnly(p.period_end)}</td>
                  <td className="px-3 py-3 text-right font-medium text-white">{fmtMoney(p.total_amount, p.currency)}</td>
                  <td className="px-5 py-3 text-right"><Button size="sm" variant="ghost" onClick={async () => { try { setInvoice(await billing.invoice(p.id)); } catch (e) { setErr(errorMessage(e)); } }}>View</Button></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {profileOpen && <ProfileModal profile={o.profile} states={o.states} onClose={() => setProfileOpen(null)}
        onSaved={async () => { const then = profileOpen.then; setProfileOpen(null); await load(); toast("Billing details saved"); if (then) void pay(then); }} />}
      <InvoiceModal invoice={invoice} onClose={() => setInvoice(null)} />
      {preview && o.plans.find((x) => x.id === preview)?.quotes[period] && (
        <CheckoutPreview quote={o.plans.find((x) => x.id === preview)!.quotes[period]!} currency={o.currency} businessName="GramForGrow" onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function ProfileModal({ profile, states, onClose, onSaved }: { profile: BillingProfile; states: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<BillingProfile>({ ...profile });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof BillingProfile, v: string) => setF((x) => ({ ...x, [k]: v }));
  const gstState = /^\d{2}/.test(f.gstin) ? f.gstin.slice(0, 2) : "";
  const save = async () => {
    setBusy(true);
    setErr(null);
    try { await billing.saveProfile({ ...f, state_code: gstState && states[gstState] ? gstState : f.state_code }); onSaved(); } catch (e) { setErr(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Billing details" width={600} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!f.legal_name.trim() || !(gstState || f.state_code)} onClick={save}>Save details</Button></>}>
      <div className="space-y-4">
        {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
        <Field label="Business / legal name"><Input value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} maxLength={200} autoFocus /></Field>
        <Field label="GSTIN (optional)" hint="15 characters. Adding it lets you claim input tax credit and sets your state automatically."><Input value={f.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={15} placeholder="27ABCDE1234F1Z5" /></Field>
        <Field label="Address"><Textarea rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={400} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City"><Input value={f.city} onChange={(e) => set("city", e.target.value)} maxLength={100} /></Field>
          <Field label="State"><Select value={gstState || f.state_code} disabled={!!gstState && !!states[gstState]} onChange={(e) => set("state_code", e.target.value)}><option value="">Select…</option>{Object.entries(states).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select></Field>
          <Field label="PIN code"><Input value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Billing email" hint="Receipts are sent here."><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" /></Field>
        </div>
      </div>
    </Modal>
  );
}

function InvoiceModal({ invoice: inv, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  if (!inv) return null;
  const a = inv.amounts;
  const m = (n: number) => fmtMoney(n, inv.currency);
  const addr = (p: { address?: string; city?: string; state: string; pincode?: string }) => [p.address, p.city, p.state, p.pincode].filter(Boolean).join(", ");
  return (
    <Modal open onClose={onClose} title="Tax invoice" width={760} footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</Button></>}>
      <style>{`@media print{body *{visibility:hidden!important}#invoice-print,#invoice-print *{visibility:visible!important}#invoice-print{position:fixed;inset:0;z-index:99999;padding:32px}}`}</style>
      <div id="invoice-print" className="theme-fixed rounded-lg bg-white p-7 text-[13px] leading-relaxed text-neutral-800">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-4">
          <div><p className="text-[18px] font-bold text-neutral-900">{inv.seller.name}</p>{inv.seller.address && <p className="max-w-xs text-neutral-500">{inv.seller.address}</p>}{inv.seller.gstin && <p className="text-neutral-500">GSTIN: {inv.seller.gstin}</p>}{inv.seller.email && <p className="text-neutral-500">{inv.seller.email}</p>}</div>
          <div className="text-right"><p className="text-[20px] font-bold tracking-wide text-neutral-900">TAX INVOICE</p><p className="font-mono text-neutral-600">{inv.number}</p><p className="text-neutral-500">{fmtDateTime(inv.date)}</p>{inv.status === "paid" && <p className="mt-1 inline-flex items-center gap-1 font-semibold text-emerald-600"><BadgeCheck size={14} /> PAID</p>}</div>
        </div>
        <div className="grid gap-4 py-4 sm:grid-cols-2">
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Billed to</p><p className="font-semibold text-neutral-900">{inv.buyer.legal_name}</p><p className="text-neutral-500">{addr({ address: inv.buyer.address, city: inv.buyer.city, state: inv.buyer.state, pincode: inv.buyer.pincode })}</p>{inv.buyer.gstin && <p className="text-neutral-500">GSTIN: {inv.buyer.gstin}</p>}{inv.buyer.email && <p className="text-neutral-500">{inv.buyer.email}</p>}</div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Place of supply</p><p className="text-neutral-900">{inv.place_of_supply || "—"}</p>{inv.razorpay_payment_id && <p className="mt-2 text-neutral-500">Payment ID: {inv.razorpay_payment_id}{inv.method ? ` (${inv.method})` : ""}</p>}</div>
        </div>
        <table className="w-full text-left"><thead><tr className="border-y border-neutral-200 text-[11.5px] uppercase tracking-wide text-neutral-400"><th className="py-2 font-medium">Description</th><th className="py-2 font-medium">SAC</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody><tr><td className="py-3 text-neutral-900">{inv.line.description}<br /><span className="text-neutral-500">{dateOnly(inv.line.period_start)} – {dateOnly(inv.line.period_end)}</span></td><td className="py-3 text-neutral-500">{inv.line.sac}</td><td className="py-3 text-right text-neutral-900">{m(a.base)}</td></tr></tbody></table>
        <div className="ml-auto mt-3 max-w-xs space-y-1 border-t border-neutral-200 pt-3">
          {a.credit > 0 && <div className="flex justify-between"><span>Credit for unused plan time</span><span>−{m(a.credit)}</span></div>}
          <div className="flex justify-between"><span>Taxable value</span><span>{m(a.taxable)}</span></div>
          {a.igst > 0 ? <div className="flex justify-between"><span>IGST ({a.gst_percent}%)</span><span>{m(a.igst)}</span></div> : <><div className="flex justify-between"><span>CGST ({a.gst_percent / 2}%)</span><span>{m(a.cgst)}</span></div><div className="flex justify-between"><span>SGST ({a.gst_percent / 2}%)</span><span>{m(a.sgst)}</span></div></>}
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-[15px] font-bold text-neutral-900"><span>Total</span><span>{m(a.total)}</span></div>
        </div>
        <p className="mt-6 text-[11.5px] text-neutral-400">This is a computer-generated invoice and does not require a signature.</p>
      </div>
    </Modal>
  );
}
