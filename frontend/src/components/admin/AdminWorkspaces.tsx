"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, CalendarPlus, CheckCircle2, Search } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, useDebounced, useUi } from "@/components/ui/kit";
import { admin, errorMessage, type AdminPlan, type AdminWorkspaceDetail, type AdminWorkspaceRow } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { dateOnly, PlanBadge, QUOTA_LABELS, StateBadge, UNLIMITED } from "./adminUi";

const PAGE = 25;
const PLAN_FILTERS = ["trial", "free", "starter", "growth", "scale", "enterprise"];

export default function AdminWorkspaces({ initialOpenId }: { initialOpenId: string | null }) {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; items: AdminWorkspaceRow[] } | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initialOpenId);
  const search = useDebounced(q, 300);

  useEffect(() => { admin.plans().then((p) => setPlans(p.plans)).catch(() => undefined); }, []);

  const load = useCallback(
    () => admin.workspaces({ q: search, plan, status, limit: PAGE, offset }).then((r) => { setData(r); setErr(null); }).catch((e) => setErr(errorMessage(e, "Couldn't load workspaces."))),
    [search, plan, status, offset],
  );
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search by workspace name or owner email…" className="pl-9" />
        </div>
        <Select value={plan} onChange={(e) => { setPlan(e.target.value); setOffset(0); }} className="!w-auto"><option value="">All plans</option>{PLAN_FILTERS.map((p) => <option key={p} value={p}>{p === "trial" ? "Free trial" : p[0].toUpperCase() + p.slice(1)}</option>)}</Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className="!w-auto"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></Select>
      </div>

      {err && <Alert>{err}</Alert>}
      {!data ? <Spinner /> : data.items.length === 0 ? <EmptyState title="No workspaces match" body="Try a different search or filter." /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="text-[11.5px] uppercase tracking-wide text-white/35"><tr><th className="px-5 py-2.5 font-medium">Workspace</th><th className="px-3 py-2.5 font-medium">Owner</th><th className="px-3 py-2.5 font-medium">Plan</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-3 py-2.5 font-medium">Seats</th><th className="px-3 py-2.5 font-medium">Created</th><th className="px-5 py-2.5" /></tr></thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-5 py-3"><span className="font-medium text-white">{t.name}</span>{t.status === "suspended" && <Badge tone="red" className="ml-2">Suspended</Badge>}<span className="block text-[11.5px] text-white/35">{t.slug}</span></td>
                    <td className="px-3 py-3 text-white/60">{t.owner_email ?? "—"}</td>
                    <td className="px-3 py-3"><PlanBadge id={t.plan_id} name={t.plan_name} /></td>
                    <td className="px-3 py-3"><StateBadge state={t.state} endsAt={t.state.ends_at} /></td>
                    <td className="px-3 py-3 text-white/60">{t.members}</td>
                    <td className="px-3 py-3 text-white/50">{dateOnly(t.created_at)}</td>
                    <td className="px-5 py-3 text-right"><Button size="sm" variant="soft" onClick={() => setSelected(t.id)}>Manage</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[12.5px] text-white/50">
            <span>{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total.toLocaleString()}</span>
            <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button><Button size="sm" variant="ghost" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next</Button></div>
          </div>
        </Card>
      )}

      {selected && <WorkspaceModal id={selected} plans={plans} onClose={() => setSelected(null)} onChanged={() => void load()} />}
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | undefined }) {
  const unlimited = limit == null || limit < 0 || limit >= UNLIMITED;
  const pct = unlimited ? 0 : Math.min(100, (used / Math.max(limit, 1)) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12.5px]"><span className="text-white/70">{label}</span><span className="text-white/50">{used.toLocaleString()} / {unlimited ? "unlimited" : limit.toLocaleString()}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? "#ef4444" : "var(--brand)" }} /></div>
    </div>
  );
}

function WorkspaceModal({ id, plans, onClose, onChanged }: { id: string; plans: AdminPlan[]; onClose: () => void; onChanged: () => void }) {
  const { toast, confirm } = useUi();
  const [d, setD] = useState<AdminWorkspaceDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planId, setPlanId] = useState("");
  const [until, setUntil] = useState("");
  const [limits, setLimits] = useState<Record<string, string>>({});

  const apply = useCallback((x: AdminWorkspaceDetail) => {
    setD(x);
    setPlanId(x.plan_id);
    setUntil(x.plan_expires_at ? x.plan_expires_at.slice(0, 10) : "");
    setLimits(Object.fromEntries(Object.keys(QUOTA_LABELS).map((k) => [k, x.quotas_override[k] !== undefined ? String(x.quotas_override[k]) : ""])));
  }, []);
  useEffect(() => { admin.workspace(id).then(apply).catch((e) => setErr(errorMessage(e, "Couldn't load this workspace."))); }, [id, apply]);

  const patch = async (body: Parameters<typeof admin.updateWorkspace>[1], done: string) => {
    setBusy(true);
    setErr(null);
    try { apply(await admin.updateWorkspace(id, body)); toast(done); onChanged(); } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  };

  if (!d) return <Modal open onClose={onClose} title="Workspace" width={780}>{err ? <Alert>{err}</Alert> : <Spinner />}</Modal>;

  const paidPlan = !["trial", "free"].includes(planId);
  const planChanged = planId !== d.plan_id;
  const untilChanged = paidPlan && until !== (d.plan_expires_at ? d.plan_expires_at.slice(0, 10) : "");
  const savePlan = () => patch({
    ...(planChanged ? { plan_id: planId } : {}),
    ...(paidPlan && until ? { plan_expires_at: new Date(`${until}T23:59:59`).toISOString() } : {}),
    ...(paidPlan && !until && (untilChanged || planChanged) ? { clear_plan_expiry: true } : {}),
  }, "Plan updated");
  const saveLimits = () => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(limits)) if (v.trim() !== "") out[k] = Number(v);
    if (Object.values(out).some((n) => !Number.isFinite(n) || n < -1)) return setErr("Limits must be numbers (use -1 or 999999 for unlimited).");
    void patch({ quotas_override: out }, Object.keys(out).length ? "Limit overrides saved" : "Overrides cleared");
  };
  const toggleSuspend = async () => {
    const suspend = d.status === "active";
    if (!(await confirm({ title: suspend ? `Suspend ${d.name}?` : `Reactivate ${d.name}?`, body: suspend ? "Everyone in this workspace is signed out of the product until you reactivate it. Data is kept." : "The workspace's users can sign in again.", confirmLabel: suspend ? "Suspend" : "Reactivate", danger: suspend }))) return;
    void patch({ status: suspend ? "suspended" : "active" }, suspend ? "Workspace suspended" : "Workspace reactivated");
  };

  return (
    <Modal open onClose={onClose} title={d.name} width={780} footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="space-y-6">
        {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <PlanBadge id={d.plan_id} name={d.plan_name} /><StateBadge state={d.state} endsAt={d.state.ends_at} />
          {d.status === "suspended" && <Badge tone="red">Suspended</Badge>}
          <span className="text-[12.5px] text-white/45">{d.slug} · created {dateOnly(d.created_at)}{d.owner_email ? ` · owner ${d.owner_email}` : ""}</span>
        </div>

        <section className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <UsageBar label="Contacts" used={d.usage.contacts} limit={d.quotas.max_contacts} />
          <UsageBar label="Team members" used={d.usage.team_members} limit={d.quotas.max_team_members} />
          <UsageBar label="Automation flows" used={d.usage.automation_flows} limit={d.quotas.max_automation_flows} />
          <UsageBar label="Instagram accounts" used={d.usage.instagram_accounts} limit={d.quotas.max_instagram_accounts} />
        </section>

        <section className="rounded-xl border border-white/10 p-4">
          <h4 className="mb-3 text-[14px] font-semibold text-white">Plan</h4>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Plan" className="min-w-[180px]"><Select value={planId} onChange={(e) => setPlanId(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_public ? "" : " (hidden)"}</option>)}</Select></Field>
            {paidPlan && <Field label="Valid until" hint="Empty = never expires"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>}
            <Button loading={busy} disabled={!planChanged && !untilChanged} onClick={savePlan}>Save plan</Button>
          </div>
          {d.plan_id === "trial" && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4 text-[13px] text-white/60">
              <CalendarPlus size={15} /> Trial ends {dateOnly(d.trial_ends_at)}. Extend by
              {[7, 14, 30].map((n) => <Button key={n} size="sm" variant="soft" disabled={busy} onClick={() => void patch({ extend_trial_days: n }, `Trial extended by ${n} days`)}>+{n} days</Button>)}
            </div>
          )}
          <p className="mt-3 text-[12px] text-white/40">Switching plans here is a manual grant — no payment is taken. Paid plans lapse to Free after the valid-until date plus a 2-day grace.</p>
        </section>

        <section className="rounded-xl border border-white/10 p-4">
          <h4 className="mb-1 text-[14px] font-semibold text-white">Limit overrides</h4>
          <p className="mb-3 text-[12px] text-white/40">Give this workspace more (or less) than its plan allows. Leave a box empty to use the plan&apos;s value. 999999 means unlimited.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(QUOTA_LABELS).map(([k, label]) => (
              <Field key={k} label={label}><Input inputMode="numeric" value={limits[k] ?? ""} onChange={(e) => setLimits((l) => ({ ...l, [k]: e.target.value.replace(/[^\d-]/g, "") }))} placeholder={String(plans.find((p) => p.id === d.plan_id)?.quotas[k] ?? "")} /></Field>
            ))}
          </div>
          <div className="mt-3"><Button size="sm" loading={busy} onClick={saveLimits}>Save limits</Button></div>
        </section>

        <section>
          <h4 className="mb-2 text-[14px] font-semibold text-white">People ({d.members.length})</h4>
          <div className="divide-y divide-white/5 rounded-xl border border-white/10 text-[13px]">
            {d.members.map((m) => (
              <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-white">{m.full_name || m.email}<span className="ml-2 text-white/40">{m.full_name ? m.email : ""}</span></span>
                <span className="flex items-center gap-2 text-white/50"><Badge>{m.role}</Badge>{!m.is_active && <Badge tone="red">Deactivated</Badge>}last login {dateOnly(m.last_login_at)}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-[14px] font-semibold text-white">Payments ({d.payments.length})</h4>
          {d.payments.length === 0 ? <p className="text-[13px] text-white/40">No payments yet.</p> : (
            <div className="divide-y divide-white/5 rounded-xl border border-white/10 text-[13px]">
              {d.payments.map((p) => <div key={p.id} className="flex items-center justify-between px-4 py-2.5"><span className="capitalize text-white">{p.plan_id} · {p.months}m <span className="ml-2 font-mono text-[12px] text-white/40">{p.invoice_number}</span></span><span className="text-white/60">{dateOnly(p.paid_at)} · <b className="text-white">{fmtMoney(p.total_amount)}</b></span></div>)}
            </div>
          )}
        </section>

        <section className="flex items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.05] p-4">
          <div><h4 className="text-[14px] font-semibold text-white">{d.status === "active" ? "Suspend workspace" : "Reactivate workspace"}</h4><p className="text-[12.5px] text-white/50">{d.status === "active" ? "Blocks every user of this workspace from signing in. Nothing is deleted." : "Lets this workspace's users sign in again."}</p></div>
          <Button variant={d.status === "active" ? "danger" : "primary"} loading={busy} onClick={() => void toggleSuspend()}>{d.status === "active" ? <><Ban size={14} /> Suspend</> : <><CheckCircle2 size={14} /> Reactivate</>}</Button>
        </section>
      </div>
    </Modal>
  );
}
