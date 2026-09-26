"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BadgeCheck, Check, FileText, ShieldCheck, Sparkles } from "lucide-react";
import {
  ENTERPRISE_EXTRAS, FEATURE_LABELS, fmtLimit, GST_PERCENT, inr, limitBullets, monthsOf, perDay, PERIODS, savingPercent,
  type FeatureKey, type Limits, type Period, type PlanInfo, type TrialInfo,
} from "@/lib/site/plans";

type Props = { plans: PlanInfo[]; trial: TrialInfo };

function PeriodToggle({ period, onChange, plans }: { period: Period; onChange: (p: Period) => void; plans: PlanInfo[] }) {
  const best = Math.max(0, ...plans.map((p) => savingPercent(p, "yearly")));
  return (
    <div role="tablist" aria-label="Billing period" className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
      {PERIODS.map((p) => (
        <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => onChange(p.id)}
          className={`flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-semibold transition ${period === p.id ? "btn-accent bg-brand text-white" : "text-white/60 hover:text-white"}`}>
          {p.label}
          {p.id === "yearly" && best > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${period === "yearly" ? "bg-white/20 text-white" : "bg-brand/15 text-brand-bright"}`}>Save {best}%</span>}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ plan, period }: { plan: PlanInfo; period: Period }) {
  const price = plan.perMonth?.[period];
  const months = monthsOf(period);
  const monthly = plan.perMonth?.monthly;
  const save = savingPercent(plan, period);
  const enterprise = !plan.perMonth;
  // Signing up or logging in lands on Billing with this plan and period pre-selected, where Pay opens the payment window.
  const buyPath = encodeURIComponent(`/dashboard/settings?tab=billing&plan=${plan.id}&interval=${period}`);

  return (
    <div className={`relative flex flex-col rounded-3xl border p-7 ${plan.highlight ? "border-brand bg-brand/[0.07] shadow-[0_20px_60px_-25px_var(--brand)]" : "border-white/10 bg-white/[0.03]"}`}>
      {plan.highlight && <span className="btn-accent absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Most popular</span>}
      <h3 className="text-[19px] font-bold text-white">{plan.name}</h3>
      <p className="mt-1.5 min-h-[42px] text-[13.5px] leading-snug text-white/55">{plan.audience}</p>

      {price ? (
        <div className="mt-5">
          <p className="flex items-baseline gap-1.5">
            <span className="text-[42px] font-extrabold leading-none tracking-tight text-white">{inr(price)}</span>
            <span className="text-[14px] text-white/45">/ month</span>
            {period === "yearly" && monthly && monthly > price && <span className="ml-1 text-[15px] text-white/35 line-through">{inr(monthly)}</span>}
          </p>
          <p className="mt-2 text-[12.5px] text-white/45">
            {period === "monthly" ? "Billed monthly" : <>Billed {inr(price * months)} a year{save > 0 && <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-pink-300">Save {save}%</span>}</>} · + {GST_PERCENT}% GST
          </p>
          <p className="mt-1 text-[12.5px] font-medium text-brand-bright">That&apos;s about {inr(perDay(price))} a day</p>
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-[36px] font-extrabold leading-none tracking-tight text-white">Let&apos;s talk</p>
          <p className="mt-2 text-[12.5px] text-white/45">Custom pricing built around your volume and team</p>
          <p className="mt-1 text-[12.5px] font-medium text-brand-bright">Volume discounts &amp; annual invoicing</p>
        </div>
      )}

      {enterprise ? (
        <>
          <Link href="/contact?topic=sales" className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-[14.5px] font-semibold text-white transition hover:bg-white/10"><Sparkles size={15} /> Talk to sales</Link>
          <p className="mt-2.5 text-center text-[12px] text-white/40">Reply within one business day</p>
        </>
      ) : (
        <>
          <Link href={`/signup?next=${buyPath}`} className={`mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14.5px] font-semibold transition ${plan.highlight ? "btn-accent bg-brand text-white hover:bg-brand-hover" : "border border-white/15 bg-white/[0.05] text-white hover:bg-white/10"}`}>
            Get {plan.name} <ArrowRight size={15} />
          </Link>
          <p className="mt-2.5 text-center text-[12px] text-white/40">Already have an account? <Link href={`/login?next=${buyPath}`} className="font-medium text-white/70 underline underline-offset-2 hover:text-white">Log in to buy</Link></p>
        </>
      )}

      <ul className="mt-6 space-y-2.5 border-t border-white/10 pt-5 text-[13.5px] text-white/70">
        {enterprise ? (
          <>
            <Li strong>Everything in Growth, without limits</Li>
            <Li>Unlimited accounts, seats &amp; contacts</Li>
            {ENTERPRISE_EXTRAS.map((f) => <Li key={f}>{f}</Li>)}
          </>
        ) : (
          <>
            <Li strong>{plan.id === "starter" ? "Every feature included" : "Everything in Starter, with more room"}</Li>
            {limitBullets(plan.limits).map((f) => <Li key={f}>{f}</Li>)}
          </>
        )}
      </ul>
    </div>
  );
}

function Li({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <li className={`flex gap-2.5 ${strong ? "font-semibold text-white" : ""}`}><Check size={15} className="mt-0.5 shrink-0 text-brand" strokeWidth={2.5} />{children}</li>;
}

export function TrustStrip({ trialDays }: { trialDays: number }) {
  const items = [
    { icon: BadgeCheck, t: `${trialDays}-day free trial`, d: "Full product, no card needed" },
    { icon: ShieldCheck, t: "7-day money-back", d: "On your first paid purchase" },
    { icon: FileText, t: "GST invoices", d: "CGST + SGST or IGST, with your GSTIN" },
    { icon: Check, t: "No auto-debit", d: "Prepaid — we remind you before it ends" },
  ];
  return (
    <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <li key={i.t} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-bright"><i.icon size={17} /></span>
          <span><span className="block text-[14px] font-semibold text-white">{i.t}</span><span className="text-[12.5px] text-white/50">{i.d}</span></span>
        </li>
      ))}
    </ul>
  );
}

/** The three plan cards with a Monthly/Yearly toggle — used on the home page and the pricing page. */
export function PlanCards({ plans, initialPeriod = "yearly" }: Pick<Props, "plans"> & { initialPeriod?: Period }) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  return (
    <div>
      <div className="mb-9 flex flex-col items-center gap-3">
        <PeriodToggle period={period} onChange={setPeriod} plans={plans} />
        <p className="text-[13px] text-white/45">Prices in ₹ per month, excluding {GST_PERCENT}% GST · switch or cancel any time</p>
      </div>
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
        {plans.map((p) => <PlanCard key={p.id} plan={p} period={period} />)}
      </div>
    </div>
  );
}

const LIMIT_ROWS: { label: string; key: keyof Limits }[] = [
  { label: "Instagram accounts", key: "numbers" },
  { label: "Team members", key: "seats" },
  { label: "Contacts", key: "contacts" },
  { label: "Comment automations", key: "automations" },
  { label: "Automation flows", key: "flows" },
  { label: "AI replies / month", key: "ai" },
  { label: "AI knowledge sources", key: "knowledge" },
];
const CORE_ROWS = ["Comment → DM & story automation", "Shared DM inbox", "Keyword replies, ice breakers & DM flows", "Sales pipeline & payment links"];

/** Volume and features side by side for the plans on sale. Every paid plan has every feature; only the limits differ. */
export function CompareTable({ plans }: Pick<Props, "plans">) {
  const cols = plans.map((p) => ({ id: p.id, name: p.name, limits: p.limits }));
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <caption className="sr-only">Plans compared</caption>
        <thead className="bg-white/[0.05] text-[12.5px] uppercase tracking-wide text-white/50">
          <tr><th scope="col" className="px-5 py-3 font-semibold">Compare</th>{cols.map((c) => <th key={c.id} scope="col" className="px-5 py-3 font-semibold">{c.name}</th>)}</tr>
        </thead>
        <tbody>
          <SectionRow label="Volume" span={cols.length + 1} />
          {LIMIT_ROWS.map((r) => (
            <tr key={r.key} className="border-t border-white/10"><th scope="row" className="px-5 py-3 font-medium text-white">{r.label}</th>{cols.map((c) => <td key={c.id} className="px-5 py-3 text-white/70">{fmtLimit(c.limits[r.key])}</td>)}</tr>
          ))}
          <SectionRow label="Included in every plan" span={cols.length + 1} />
          {[...CORE_ROWS, ...(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => FEATURE_LABELS[k].label)].map((label) => (
            <tr key={label} className="border-t border-white/10"><th scope="row" className="px-5 py-3 font-medium text-white">{label}</th>{cols.map((c) => <td key={c.id} className="px-5 py-3"><Check size={16} className="text-brand" strokeWidth={2.5} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionRow({ label, span }: { label: string; span: number }) {
  return <tr className="border-t border-white/10 bg-white/[0.03]"><td colSpan={span} className="px-5 py-2 text-[11.5px] font-bold uppercase tracking-[0.12em] text-brand-bright">{label}</td></tr>;
}

export default function PricingTable({ plans, trial }: Props) {
  return (
    <div>
      <PlanCards plans={plans} />
      <TrustStrip trialDays={trial.days} />
      <div className="mt-16">
        <h2 className="text-center text-[24px] font-extrabold tracking-tight text-white sm:text-[28px]">Every plan has every feature</h2>
        <p className="mx-auto mb-8 mt-2 max-w-2xl text-center text-[14.5px] leading-relaxed text-white/55">
          You only pay for volume: contacts, team members, automations and AI replies. Every feature is unlocked the day you subscribe.
        </p>
        <CompareTable plans={plans} />
      </div>
    </div>
  );
}
