"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Field, Input, Spinner, Toggle, useUi } from "@/components/ui/kit";
import { admin, errorMessage, type AdminPlan, type AdminPlans } from "@/lib/api";
import { PlanBadge, QUOTA_LABELS } from "./adminUi";

const rupees = (paise: number | null) => (paise == null ? "" : String(paise / 100));
const toPaise = (v: string) => Math.round(Number(v) * 100);

export default function AdminPlansTab() {
  const { toast } = useUi();
  const [data, setData] = useState<AdminPlans | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState("");
  const [savingDays, setSavingDays] = useState(false);

  const load = useCallback(
    () => admin.plans().then((d) => { setData(d); setDays(String(d.trial_days)); }).catch((e) => setErr(errorMessage(e, "Couldn't load plans."))),
    [],
  );
  useEffect(() => { void load(); }, [load]);

  if (err) return <Alert>{err}</Alert>;
  if (!data) return <Spinner />;

  const saveDays = async () => {
    setSavingDays(true);
    try { await admin.setTrialDays(Number(days)); toast("Trial length updated for new sign-ups"); await load(); } catch (e) { setErr(errorMessage(e)); }
    setSavingDays(false);
  };

  return (
    <div className="space-y-6">
      <Alert tone="blue">
        Changes here apply immediately to every workspace on the plan, and the public pricing page picks them up within a few minutes. The boot-time seed never overwrites what you set here.
      </Alert>

      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Free trial length</h3>
            <p className="mt-1 max-w-xl text-[12.5px] text-white/50">How many days a new workspace gets on the free trial. Existing trials keep the end date they already have — extend individual workspaces from the Workspaces tab.</p>
          </div>
          <div className="flex items-end gap-2">
            <Field label="Days"><Input inputMode="numeric" className="!w-24" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></Field>
            <Button loading={savingDays} disabled={!days || Number(days) === data.trial_days || Number(days) < 1 || Number(days) > 365} onClick={() => void saveDays()}>Save</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        {data.plans.map((p) => <PlanEditor key={p.id} plan={p} catalog={data.feature_catalog} onSaved={load} />)}
      </div>
    </div>
  );
}

function PlanEditor({ plan, catalog, onSaved }: { plan: AdminPlan; catalog: AdminPlans["feature_catalog"]; onSaved: () => Promise<void> }) {
  const { toast } = useUi();
  const unpaid = plan.id === "trial" || plan.id === "free";
  const [name, setName] = useState(plan.name);
  const [prices, setPrices] = useState({ monthly: rupees(plan.price_monthly), quarterly: rupees(plan.price_quarterly), yearly: rupees(plan.price_yearly) });
  const [quotas, setQuotas] = useState<Record<string, string>>(Object.fromEntries(Object.keys(QUOTA_LABELS).map((k) => [k, String(plan.quotas[k] ?? "")])));
  const [features, setFeatures] = useState<Record<string, boolean>>(plan.features);
  const [isPublic, setIsPublic] = useState(plan.is_public);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const q: Record<string, number> = {};
      for (const [k, v] of Object.entries(quotas)) if (v.trim() !== "") q[k] = Number(v);
      await admin.updatePlan(plan.id, {
        name, quotas: q, features, is_public: isPublic,
        ...(!unpaid && plan.id !== "enterprise" ? {
          price_monthly: toPaise(prices.monthly || "0"), price_quarterly: toPaise(prices.quarterly || "0"), price_yearly: toPaise(prices.yearly || "0"),
        } : {}),
      });
      toast(`${name} saved`);
      await onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5"><PlanBadge id={plan.id} name={plan.name} /><span className="text-[12.5px] text-white/45">{plan.workspaces.toLocaleString()} workspace{plan.workspaces === 1 ? "" : "s"}</span>{!plan.is_public && <Badge>Hidden from sale</Badge>}</div>
        {!unpaid && <Toggle checked={isPublic} onChange={setIsPublic} label="Offered for sale" />}
      </div>
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2"><Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} /></Field></div>

      {!unpaid && plan.id !== "enterprise" && (
        <div className="mt-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">Price per month, in ₹ (before GST)</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Monthly"><Input inputMode="decimal" value={prices.monthly} onChange={(e) => setPrices((x) => ({ ...x, monthly: e.target.value.replace(/[^\d.]/g, "") }))} /></Field>
            <Field label="Yearly" hint="Per month, billed yearly"><Input inputMode="decimal" value={prices.yearly} onChange={(e) => setPrices((x) => ({ ...x, yearly: e.target.value.replace(/[^\d.]/g, "") }))} /></Field>
            <Field label="Quarterly" hint="Legacy — not shown on the site"><Input inputMode="decimal" value={prices.quarterly} onChange={(e) => setPrices((x) => ({ ...x, quarterly: e.target.value.replace(/[^\d.]/g, "") }))} /></Field>
          </div>
        </div>
      )}
      {plan.id === "enterprise" && <p className="mt-4 text-[12.5px] text-white/45">Enterprise has no online price — customers contact sales, and you assign the plan from the Workspaces tab.</p>}

      <div className="mt-5">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">Limits <span className="normal-case tracking-normal text-white/30">(999999 = unlimited)</span></p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(QUOTA_LABELS).map(([k, label]) => (
            <Field key={k} label={label}><Input inputMode="numeric" value={quotas[k] ?? ""} onChange={(e) => setQuotas((x) => ({ ...x, [k]: e.target.value.replace(/[^\d-]/g, "") }))} /></Field>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">Features {unpaid && <span className="normal-case tracking-normal text-white/30">— off means &quot;Upgrade your plan to access this&quot;</span>}</p>
        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {Object.entries(catalog).map(([k, info]) => (
            <div key={k} title={info.blurb}><Toggle checked={features[k] !== false} onChange={(v) => setFeatures((f) => ({ ...f, [k]: v }))} label={info.label} /></div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end"><Button loading={busy} onClick={() => void save()}>Save {plan.name}</Button></div>
    </Card>
  );
}
