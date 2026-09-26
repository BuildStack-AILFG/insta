"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Copy, KeyRound, Mail, Plus, Settings2, Trash2, Webhook } from "lucide-react";
import Link from "next/link";
import { Alert, Badge, Button, Card, CopyField, EmptyState, Field, fmtDateTime, Input, Modal, Page, PageHeader, Select, Spinner, statusTone, Tabs, Textarea, timeAgo, useUi } from "@/components/ui/kit";
import {
  API_ORIGIN, developer, errorMessage, getSettings, getWorkspaceDetail, patchSettings, rotatePassword, team, updateWorkspaceName,
  type ApiKeyRow, type ApiWorkspaceDetail, type Invite, type Member, type WebhookRow,
} from "@/lib/api";
import { useWorkspace } from "@/components/dashboard/WorkspaceContext";
import AssignmentRules from "@/components/dashboard/AssignmentRules";
import { UpgradeGate, useHasFeature } from "@/components/dashboard/UpgradeGate";
import BillingTab from "@/components/sales/BillingTab";
import PaymentsTab from "@/components/sales/PaymentsTab";

type TabId = "workspace" | "billing" | "payments" | "team" | "assignment" | "quick" | "developer" | "account";

export default function SettingsPage() {
  return <Suspense fallback={<Spinner />}><Settings /></Suspense>;
}

function Settings() {
  const router = useRouter();
  const params = useSearchParams();
  const { role } = useWorkspace();
  const manager = role === "owner" || role === "admin";
  const hasApi = useHasFeature("api_access");
  const hasAssign = useHasFeature("assignment_rules");
  const initial = (params.get("tab") as TabId) || "workspace";
  const [tab, setTabState] = useState<TabId>(initial);
  useEffect(() => { const t = params.get("tab") as TabId | null; if (t) setTabState(t); }, [params]);
  const setTab = (t: TabId) => { setTabState(t); router.replace(`/dashboard/settings?tab=${t}`, { scroll: false }); };
  const tabs: { id: TabId; label: string }[] = [{ id: "workspace", label: "Workspace" }, ...(manager ? [{ id: "billing" as const, label: "Plan & billing" }, { id: "payments" as const, label: "Payments" }] : []), { id: "team", label: "Team" }, ...(manager ? [{ id: "assignment" as const, label: "Assignment" }] : []), { id: "quick", label: "Quick replies" }, ...(manager ? [{ id: "developer" as const, label: "Developer" }] : []), { id: "account", label: "Account" }];

  return (
    <Page>
      <PageHeader icon={<Settings2 size={20} />} title="Settings" subtitle="Your workspace, team and developer tools." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "workspace" && <WorkspaceTab manager={manager} />}
      {tab === "billing" && manager && <BillingTab />}
      {tab === "payments" && manager && <PaymentsTab />}
      {tab === "team" && <TeamTab manager={manager} isOwner={role === "owner"} />}
      {tab === "assignment" && manager && (hasAssign ? <AssignmentRules /> : <UpgradeGate feature="assignment_rules" inline />)}
      {tab === "quick" && <QuickReplies />}
      {tab === "developer" && manager && (hasApi ? <DeveloperTab /> : <UpgradeGate feature="api_access" inline />)}
      {tab === "account" && <AccountTab />}
    </Page>
  );
}

// ---- workspace ---------------------------------------------------------------------------------------------------------------------------------------------

function Usage({ label, used, limit }: { label: string; used: number; limit: number | undefined }) {
  const unlimited = limit == null || limit < 0;
  const pct = unlimited ? 0 : Math.min(100, (used / Math.max(limit, 1)) * 100);
  return (
    <div><div className="mb-1 flex justify-between text-[12.5px]"><span className="text-white/70">{label}</span><span className="text-white/50">{used.toLocaleString()} / {unlimited ? "unlimited" : limit.toLocaleString()}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? "#ef4444" : "var(--brand)" }} /></div></div>
  );
}

function WorkspaceTab({ manager }: { manager: boolean }) {
  const { toast } = useUi();
  const { refresh } = useWorkspace();
  const [d, setD] = useState<ApiWorkspaceDetail | null>(null);
  const [name, setName] = useState("");
  const [cc, setCc] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getWorkspaceDetail().then((x) => { setD(x); setName(x.name); }).catch((e) => setErr(errorMessage(e)));
    getSettings().then((s) => setCc(String(s.settings.default_country_code ?? ""))).catch(() => {});
  }, []);
  if (!d) return err ? <Alert>{err}</Alert> : <Spinner />;

  return (
    <div className="space-y-5">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <Card className="space-y-4 p-5">
        <h3 className="text-[15px] font-semibold text-white">Workspace</h3>
        <Field label="Workspace name"><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!manager} /></Field>
        <Field label="Default country code" hint="Used when you enter phone numbers without +country (contacts, imports, API). E.g. 91 for India."><Input value={cc} onChange={(e) => setCc(e.target.value.replace(/\D/g, ""))} placeholder="91" disabled={!manager} className="!w-32" /></Field>
        {manager && <div className="flex justify-end"><Button loading={busy} onClick={async () => { setBusy(true); setErr(null); try { if (name.trim() !== d.name) { setD(await updateWorkspaceName(name.trim())); await refresh(); } await patchSettings({ default_country_code: cc }); toast("Workspace saved"); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } }}>Save</Button></div>}
      </Card>
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[15px] font-semibold text-white">Plan & usage</h3><Badge tone="green">{d.plan.name}</Badge></div>
        {d.trial_ends_at && d.plan.id === "trial" && <p className="mb-4 text-[12.5px] text-white/50">Trial ends {fmtDateTime(d.trial_ends_at)}.</p>}
        <div className="grid gap-4 sm:grid-cols-2"><Usage label="Contacts" used={d.usage.contacts} limit={d.quotas.max_contacts} /><Usage label="Team members" used={d.usage.team_members} limit={d.quotas.max_team_members} /><Usage label="Automation flows" used={d.usage.automation_flows} limit={d.quotas.max_automation_flows} />
          <div className="text-[12.5px] text-white/50">Up to {d.quotas.max_comment_automations?.toLocaleString() ?? "∞"} comment automations · {d.quotas.max_instagram_accounts?.toLocaleString() ?? "∞"} Instagram account{d.quotas.max_instagram_accounts === 1 ? "" : "s"} · {d.quotas.ai_replies_included_per_month?.toLocaleString() ?? "∞"} AI replies / month</div></div>
      </Card>
      {manager && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div><h3 className="text-[15px] font-semibold text-white">Upgrade or renew</h3><p className="mt-0.5 text-[12.5px] text-white/50">Pay online by UPI, card or netbanking. GST invoices are generated automatically.</p></div>
          <Link href="/dashboard/settings?tab=billing" className="btn-accent inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13.5px] font-medium text-white hover:brightness-110">Plan &amp; billing <ArrowRight size={14} /></Link>
        </Card>
      )}
    </div>
  );
}

// ---- team ---------------------------------------------------------------------------------------------------------------------------------------------------

function TeamTab({ manager, isOwner }: { manager: boolean; isOwner: boolean }) {
  const { toast, confirm } = useUi();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setMembers(await team.members()); if (manager) setInvites(await team.invites()); } catch (e) { setErr(errorMessage(e)); } }, [manager]);
  useEffect(() => { void load(); }, [load]);

  const invite = async () => {
    setBusy(true); setErr(null); setLink(null);
    try { const i = await team.invite(email.trim(), role); setEmail(""); if (i.email_sent) toast(`Invitation emailed to ${i.email}`); else setLink(i.invite_link ?? null); await load(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      {manager && (
        <Card className="p-5"><h3 className="mb-3 text-[15px] font-semibold text-white">Invite a teammate</h3>
          <div className="flex flex-wrap items-end gap-3"><Field label="Email" className="min-w-[240px] flex-1"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" /></Field>
            <Field label="Role"><Select value={role} onChange={(e) => setRole(e.target.value)} className="!w-40"><option value="agent">Agent</option><option value="viewer">Viewer</option>{isOwner && <option value="admin">Admin</option>}</Select></Field>
            <Button loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email)} onClick={invite}><Mail size={14} /> Send invite</Button></div>
          <p className="mt-3 text-[12px] text-white/40"><b>Admin</b>: everything except ownership. <b>Agent</b>: inbox, contacts, automations, flows. <b>Viewer</b>: read-only.</p>
          {link && <div className="mt-4"><Alert tone="blue">Email delivery isn&apos;t configured on this server, so share this link with them yourself (valid 7 days):</Alert><CopyField value={link} /></div>}
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="border-b border-white/10 px-5 py-3 text-[15px] font-semibold text-white">Members</div>
        {!members ? <Spinner /> : members.map((m) => (
          <div key={m.user_id} className="flex flex-wrap items-center gap-3 border-b border-white/5 px-5 py-3 last:border-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[13px] font-semibold">{(m.full_name || m.email)[0].toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] text-white">{m.full_name || m.email}{m.is_you && <span className="ml-2 text-[11px] text-white/35">you</span>}</div><div className="truncate text-[12px] text-white/40">{m.email} · last active {timeAgo(m.last_login_at)}</div></div>
            {manager && !m.is_you && (isOwner || !["owner", "admin"].includes(m.role)) ? (
              <><Select value={m.role} className="!w-32 !py-1.5 text-[12.5px]" aria-label={`Role for ${m.email}`} onChange={async (e) => { try { await team.setRole(m.user_id, e.target.value); toast("Role updated"); await load(); } catch (er) { setErr(errorMessage(er)); } }}>
                {isOwner && <option value="owner">Owner</option>}{isOwner && <option value="admin">Admin</option>}<option value="agent">Agent</option><option value="viewer">Viewer</option></Select>
                <Button size="sm" variant="danger" aria-label={`Remove ${m.email}`} onClick={async () => { if (await confirm({ title: `Remove ${m.full_name || m.email}?`, body: "They lose access immediately; their chats become unassigned.", confirmLabel: "Remove", danger: true })) { try { await team.remove(m.user_id); await load(); toast("Member removed"); } catch (er) { setErr(errorMessage(er)); } } }}><Trash2 size={13} /></Button></>
            ) : <Badge tone={m.role === "owner" ? "green" : "gray"}>{m.role}</Badge>}
          </div>))}
      </Card>
      {manager && invites.length > 0 && (
        <Card className="overflow-hidden"><div className="border-b border-white/10 px-5 py-3 text-[15px] font-semibold text-white">Pending invitations</div>
          {invites.map((i) => <div key={i.id} className="flex items-center gap-3 border-b border-white/5 px-5 py-3 last:border-0"><div className="min-w-0 flex-1 text-[13.5px] text-white">{i.email}<span className="ml-2 text-[12px] text-white/40">{i.role} · {i.expired ? "expired" : `expires ${fmtDateTime(i.expires_at)}`}</span></div>
            <Badge tone={i.expired ? "red" : "yellow"}>{i.expired ? "expired" : "pending"}</Badge><Button size="sm" variant="ghost" onClick={async () => { try { await team.revoke(i.id); await load(); } catch (e) { setErr(errorMessage(e)); } }}>Revoke</Button></div>)}</Card>
      )}
    </div>
  );
}

// ---- quick replies -----------------------------------------------------------------------------------------------------------------------------------------

function QuickReplies() {
  const { toast } = useUi();
  const [items, setItems] = useState<{ id?: string; shortcut: string; text: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getSettings().then((s) => setItems((s.settings.quick_replies as typeof items) ?? [])).catch((e) => setErr(errorMessage(e))); }, []);
  if (!items) return err ? <Alert>{err}</Alert> : <Spinner />;
  return (
    <div className="space-y-4">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <p className="text-[13px] text-white/55">Canned answers your team can insert in the inbox by typing <code>/</code> and the shortcut.</p>
      {items.length === 0 && <EmptyState title="No quick replies yet" body="Add the answers you type most often." />}
      {items.map((q, i) => (
        <Card key={i} className="grid gap-3 p-4 md:grid-cols-[180px_1fr_auto]"><Input value={q.shortcut} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, shortcut: e.target.value.replace(/\s/g, "") } : x)))} placeholder="shortcut, e.g. thanks" aria-label="Shortcut" />
          <Textarea value={q.text} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="!min-h-[56px]" placeholder="Message text" aria-label="Text" />
          <Button variant="danger" size="sm" aria-label="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={13} /></Button></Card>))}
      <div className="flex justify-between"><Button variant="ghost" onClick={() => setItems([...items, { shortcut: "", text: "" }])}><Plus size={14} /> Add quick reply</Button>
        <Button loading={busy} onClick={async () => { setBusy(true); setErr(null); try { const r = await patchSettings({ quick_replies: items.filter((q) => q.shortcut.trim() && q.text.trim()) }); setItems((r.settings.quick_replies as typeof items) ?? []); toast("Quick replies saved"); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } }}>Save</Button></div>
    </div>
  );
}

// ---- developer ---------------------------------------------------------------------------------------------------------------------------------------------

function DeveloperTab() {
  const { toast, confirm } = useUi();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [hooks, setHooks] = useState<WebhookRow[] | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [newKey, setNewKey] = useState<ApiKeyRow | null>(null);
  const [keyName, setKeyName] = useState("");
  const [hookForm, setHookForm] = useState<{ url: string; events: string[] } | null>(null);
  const [newSecret, setNewSecret] = useState<{ url: string; secret: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { try { const [k, h] = await Promise.all([developer.keys(), developer.webhooks()]); setKeys(k); setHooks(h); } catch (e) { setErr(errorMessage(e)); } }, []);
  useEffect(() => { void load(); developer.events().then(setEvents).catch(() => {}); }, [load]);

  return (
    <div className="space-y-6">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><KeyRound size={17} className="text-white/60" /><h3 className="text-[15px] font-semibold text-white">API keys</h3></div>
        <p className="mb-4 text-[12.5px] text-white/50">DM people who messaged you, upsert contacts and track events from your own systems. Base URL <code className="text-white/80">{API_ORIGIN}/api/v1</code> · 300 requests/minute per key.</p>
        <div className="mb-4 flex gap-2"><Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name, e.g. Zapier or Backend" className="max-w-xs" aria-label="API key name" /><Button disabled={!keyName.trim()} onClick={async () => { try { setNewKey(await developer.createKey(keyName.trim())); setKeyName(""); await load(); } catch (e) { setErr(errorMessage(e)); } }}><Plus size={14} /> Create key</Button></div>
        {!keys ? <Spinner /> : keys.length === 0 ? <div className="text-[13px] text-white/40">No keys yet.</div> : keys.map((k) => (
          <div key={k.id} className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0"><div className="min-w-0 flex-1"><span className="text-[13.5px] text-white">{k.name}</span><span className="ml-2 font-mono text-[12px] text-white/40">{k.prefix}…</span><div className="text-[11.5px] text-white/35">Created {timeAgo(k.created_at)} · last used {timeAgo(k.last_used_at)}</div></div>
            {k.revoked ? <Badge tone="red">revoked</Badge> : <Button size="sm" variant="danger" onClick={async () => { if (await confirm({ title: `Revoke “${k.name}”?`, body: "Anything using this key stops working immediately.", confirmLabel: "Revoke", danger: true })) { try { await developer.revokeKey(k.id); await load(); } catch (e) { setErr(errorMessage(e)); } } }}>Revoke</Button>}</div>))}
        <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-4 text-[11.5px] leading-relaxed text-white/70">{`curl -X POST ${API_ORIGIN}/api/v1/messages \\
  -H "Authorization: Bearer lfg_live_…" -H "Content-Type: application/json" \\
  -d '{"username":"asha.rao","text":"Your order #1042 has shipped!",
       "buttons":[{"title":"Track order","url":"https://shop.example.com/t/1042"}]}'`}</pre>
        <p className="mt-2 text-[12px] text-white/40">Also: <code>POST /v1/contacts</code> (upsert), <code>POST /v1/events</code> (track + trigger flows), <code>GET /v1/contacts</code>. Instagram only lets you DM someone within 24 hours of their last message.</p>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Webhook size={17} className="text-white/60" /><h3 className="text-[15px] font-semibold text-white">Outbound webhooks</h3></div><Button size="sm" onClick={() => setHookForm({ url: "", events: [] })}><Plus size={13} /> Add endpoint</Button></div>
        <p className="mb-4 text-[12.5px] text-white/50">We POST signed JSON events to your URL. Verify the <code>X-LFG-Signature</code> header (HMAC-SHA256 of the raw body with your secret). Endpoints failing 5 times in a row are disabled automatically.</p>
        {!hooks ? <Spinner /> : hooks.length === 0 ? <div className="text-[13px] text-white/40">No webhooks yet.</div> : hooks.map((h) => (
          <div key={h.id} className="border-b border-white/5 py-3 last:border-0"><div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-white">{h.url}</span><Badge tone={h.enabled ? statusTone("connected") : "red"}>{h.enabled ? "active" : "disabled"}</Badge>
            <Button size="sm" variant="ghost" onClick={async () => { try { const r = await developer.testWebhook(h.id); toast(r.ok ? "Test delivered ✓" : `Test failed: ${r.detail}`, r.ok ? "success" : "error"); await load(); } catch (e) { setErr(errorMessage(e)); } }}>Test</Button>
            <Button size="sm" variant="ghost" onClick={async () => { try { const s = await developer.secret(h.id); setNewSecret({ url: h.url, secret: s.secret }); } catch (e) { setErr(errorMessage(e)); } }}>Secret</Button>
            {!h.enabled && <Button size="sm" variant="soft" onClick={async () => { try { await developer.updateWebhook(h.id, { url: h.url, events: h.events, enabled: true }); await load(); toast("Re-enabled"); } catch (e) { setErr(errorMessage(e)); } }}>Re-enable</Button>}
            <Button size="sm" variant="danger" aria-label="Delete webhook" onClick={async () => { if (await confirm({ title: "Delete this endpoint?", confirmLabel: "Delete", danger: true })) { try { await developer.removeWebhook(h.id); await load(); } catch (e) { setErr(errorMessage(e)); } } }}><Trash2 size={13} /></Button></div>
            <div className="mt-1 text-[11.5px] text-white/35">{h.events.length ? h.events.join(", ") : "all events"}{h.last_status && ` · last: ${h.last_status} ${timeAgo(h.last_delivery_at)}`}</div></div>))}
      </Card>

      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Your new API key" width={520} footer={<Button onClick={() => setNewKey(null)}>I&apos;ve saved it</Button>}>
        <Alert tone="yellow">Copy it now — for security it won&apos;t be shown again.</Alert>{newKey?.key && <CopyField value={newKey.key} />}</Modal>
      <Modal open={!!newSecret} onClose={() => setNewSecret(null)} title="Signing secret" width={520} footer={<Button onClick={() => setNewSecret(null)}>Done</Button>}><p className="mb-3 truncate text-[12.5px] text-white/50">{newSecret?.url}</p>{newSecret && <CopyField value={newSecret.secret} />}</Modal>
      <Modal open={!!hookForm} onClose={() => setHookForm(null)} title="Add webhook endpoint" width={560}
        footer={<><Button variant="ghost" onClick={() => setHookForm(null)}>Cancel</Button><Button disabled={!/^https?:\/\//.test(hookForm?.url ?? "")} onClick={async () => { try { const h = await developer.createWebhook(hookForm!); setHookForm(null); await load(); if (h.secret) setNewSecret({ url: h.url, secret: h.secret }); } catch (e) { setErr(errorMessage(e)); setHookForm(null); } }}>Add endpoint</Button></>}>
        <Field label="Endpoint URL" hint="Must be a public https address"><Input value={hookForm?.url ?? ""} onChange={(e) => setHookForm({ ...hookForm!, url: e.target.value })} placeholder="https://api.example.com/webhooks/whatsapp" autoFocus /></Field>
        <div className="mt-4"><div className="mb-2 text-[12.5px] font-medium text-white/70">Events {hookForm?.events.length ? "" : "(none selected = all)"}</div>
          <div className="grid grid-cols-2 gap-1.5">{events.map((e) => <label key={e} className="flex items-center gap-2 text-[12.5px] text-white/70"><input type="checkbox" className="accent-brand" checked={hookForm?.events.includes(e) ?? false} onChange={(ev) => setHookForm({ ...hookForm!, events: ev.target.checked ? [...hookForm!.events, e] : hookForm!.events.filter((x) => x !== e) })} />{e}</label>)}</div></div>
      </Modal>
    </div>
  );
}

// ---- account ---------------------------------------------------------------------------------------------------------------------------------------------------

function AccountTab() {
  const { toast } = useUi();
  const { email, full_name, role } = useWorkspace();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="max-w-xl space-y-4 p-5">
      <div><div className="text-[15px] font-semibold text-white">{full_name || email}</div><div className="text-[12.5px] text-white/45">{email} · {role}</div></div>
      <h3 className="pt-2 text-[14px] font-semibold text-white">Change password</h3>
      {err && <Alert>{err}{rules.length > 0 && <ul className="mt-1 list-disc pl-5">{rules.map((r) => <li key={r}>{r}</li>)}</ul>}</Alert>}
      <Field label="Current password"><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
      <Field label="New password" hint="12+ characters with a mix of letters, numbers and symbols"><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
      <div className="flex justify-end"><Button loading={busy} disabled={!cur || !next} onClick={async () => {
        setBusy(true); setErr(null); setRules([]);
        try { await rotatePassword({ currentPassword: cur, newPassword: next }); setCur(""); setNext(""); toast("Password changed — other devices were signed out"); }
        catch (e) { setErr(errorMessage(e)); setRules((e as { passwordFailures?: { message: string }[] }).passwordFailures?.map((f) => f.message) ?? []); } finally { setBusy(false); }
      }}><Copy size={0} className="hidden" />Update password</Button></div>
    </Card>
  );
}
