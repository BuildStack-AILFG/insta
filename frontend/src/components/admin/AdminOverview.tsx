"use client";

import { useEffect, useState } from "react";
import { Alert, Card, Spinner, Stat } from "@/components/ui/kit";
import { admin, errorMessage, type AdminOverview as Overview } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { dateOnly, PLAN_TONE, PlanBadge, StateBadge } from "./adminUi";

const PLAN_ORDER = ["trial", "free", "starter", "growth", "scale", "enterprise"];

export default function AdminOverview({ onOpen }: { onOpen: (id: string) => void }) {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { admin.overview().then(setO).catch((e) => setErr(errorMessage(e, "Couldn't load the overview."))); }, []);

  if (err) return <Alert>{err}</Alert>;
  if (!o) return <Spinner />;
  const w = o.workspaces;
  const max = Math.max(1, ...Object.values(w.by_plan));
  const plans = Object.keys(w.by_plan).sort((a, b) => PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Workspaces" value={w.total.toLocaleString()} sub={`${o.signups.last_7d} new in 7 days · ${o.signups.last_30d} in 30`} />
        <Stat label="Paying" value={w.paying.toLocaleString()} sub="Active paid plans" tone="green" />
        <Stat label="On free trial" value={w.trial_active.toLocaleString()} sub={w.trial_expiring_3d ? `${w.trial_expiring_3d} ending within 3 days` : "None ending soon"} />
        <Stat label="Suspended" value={w.suspended.toLocaleString()} tone={w.suspended ? "red" : undefined} sub={`${o.users.toLocaleString()} users in total`} />
        <Stat label="MRR (estimate)" value={fmtMoney(o.revenue.mrr, o.revenue.currency, { compact: true })} sub="Monthly value of active paid plans, before GST" />
        <Stat label="Revenue, last 30 days" value={fmtMoney(o.revenue.last_30_days, o.revenue.currency, { compact: true })} sub="Paid orders incl. GST" />
        <Stat label="Revenue, all time" value={fmtMoney(o.revenue.all_time, o.revenue.currency, { compact: true })} sub="Paid orders incl. GST" />
        <Stat label="Users" value={o.users.toLocaleString()} sub="Across all workspaces" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-[15px] font-semibold text-white">Workspaces by plan</h3>
          <div className="space-y-3">
            {plans.map((p) => (
              <div key={p}>
                <div className="mb-1 flex justify-between text-[12.5px]"><span className="capitalize text-white/75">{p === "trial" ? "Free trial" : p}</span><span className="text-white/50">{w.by_plan[p]}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${(w.by_plan[p] / max) * 100}%`, background: PLAN_TONE[p] === "gray" ? "var(--ink-faint)" : "var(--brand)" }} /></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <h3 className="border-b border-white/10 px-5 py-3 text-[15px] font-semibold text-white">Recent payments</h3>
          {o.recent_payments.length === 0 ? <p className="px-5 py-6 text-[13px] text-white/40">No payments yet.</p> : (
            <table className="w-full text-left text-[13px]"><tbody>
              {o.recent_payments.map((p) => (
                <tr key={p.id} className="border-t border-white/5 first:border-t-0">
                  <td className="px-5 py-2.5 text-white">{p.workspace}<span className="block text-[11.5px] capitalize text-white/40">{p.plan_id} · {p.months}m · {p.invoice_number}</span></td>
                  <td className="px-3 py-2.5 text-white/50">{dateOnly(p.paid_at)}</td>
                  <td className="px-5 py-2.5 text-right font-medium text-white">{fmtMoney(p.total_amount, o.revenue.currency)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <h3 className="border-b border-white/10 px-5 py-3 text-[15px] font-semibold text-white">Newest workspaces</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-[11.5px] uppercase tracking-wide text-white/35"><tr><th className="px-5 py-2 font-medium">Workspace</th><th className="px-3 py-2 font-medium">Owner</th><th className="px-3 py-2 font-medium">Plan</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Created</th></tr></thead>
            <tbody>
              {o.recent_workspaces.map((t) => (
                <tr key={t.id} onClick={() => onOpen(t.id)} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.04]">
                  <td className="px-5 py-3 font-medium text-white">{t.name}</td>
                  <td className="px-3 py-3 text-white/60">{t.owner_email ?? "—"}</td>
                  <td className="px-3 py-3"><PlanBadge id={t.plan_id} name={t.plan_name} /></td>
                  <td className="px-3 py-3"><StateBadge state={t.state} endsAt={t.state.ends_at} /></td>
                  <td className="px-3 py-3 text-white/50">{dateOnly(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
