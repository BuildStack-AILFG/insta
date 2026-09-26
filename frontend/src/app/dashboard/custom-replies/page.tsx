"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareReply, Plus, Trash2, Workflow } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Page, PageHeader, Select, Spinner, Textarea, Toggle, useUi } from "@/components/ui/kit";
import { customReplies as api, errorMessage, flows as flowsApi, getSettings, patchSettings, type CustomReply, type FlowSummary } from "@/lib/api";

const MATCH = { exact: "Exact match", contains: "Contains", any: "Any message" } as const;

export default function CustomRepliesPage() {
  const { toast, confirm } = useUi();
  const [list, setList] = useState<CustomReply[] | null>(null);
  const [flowList, setFlowList] = useState<FlowSummary[]>([]);
  const [master, setMaster] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomReply | "new" | null>(null);

  const load = useCallback(async () => { try { setList(await api.list()); } catch (e) { setError(errorMessage(e, "Couldn't load custom replies.")); } }, []);
  useEffect(() => { void load(); flowsApi.list().then((f) => setFlowList(f.filter((x) => x.status === "published"))).catch(() => {}); getSettings().then((s) => setMaster((s.settings.custom_replies_enabled as boolean | undefined) ?? true)).catch(() => {}); }, [load]);

  return (
    <Page>
      <PageHeader icon={<MessageSquareReply size={20} />} title="Custom replies" subtitle="Answer common messages automatically. The first match wins, in this order: exact → contains → any message."
        actions={<><label className="flex items-center gap-2 text-[13px] text-white/60">All custom replies <Toggle checked={master} label="Custom replies enabled" onChange={async (v) => { setMaster(v); try { await patchSettings({ custom_replies_enabled: v }); } catch (e) { setMaster(!v); toast(errorMessage(e), "error"); } }} /></label><Button onClick={() => setEditing("new")}><Plus size={15} /> New reply</Button></>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      {!master && <Alert tone="yellow">Custom replies are switched off — nothing below will be sent.</Alert>}
      {!list ? <Spinner /> : list.length === 0 ? <EmptyState icon={<MessageSquareReply size={22} />} title="No custom replies yet" body="Add one for “price”, “hours”, “location”… and stop typing the same answers." action={<Button onClick={() => setEditing("new")}><Plus size={15} /> Add your first reply</Button>} /> : (
        <div className="space-y-3">{list.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge tone={r.match_type === "exact" ? "blue" : r.match_type === "any" ? "yellow" : "gray"}>{MATCH[r.match_type]}</Badge>
                {r.match_type !== "any" && r.trigger.split(/[,\n]/).map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className="rounded-md bg-white/10 px-2 py-0.5 text-[12.5px] text-white">{t}</span>)}
                {r.flow_id && <Badge tone="green"><Workflow size={10} /> runs a flow</Badge>}</div>
                {r.reply_text && <p className="mt-2 whitespace-pre-wrap text-[13.5px] text-white/70">{r.reply_text}</p>}
                <div className="mt-1.5 text-[11.5px] text-white/35">Sent {r.conversations_sent.toLocaleString()} time{r.conversations_sent === 1 ? "" : "s"}</div></div>
              <div className="flex items-center gap-2"><Toggle checked={r.enabled} label="Enabled" onChange={async (v) => { setList((l) => l!.map((x) => (x.id === r.id ? { ...x, enabled: v } : x))); try { await api.update(r.id, { enabled: v }); } catch (e) { toast(errorMessage(e), "error"); void load(); } }} />
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => { if (await confirm({ title: "Delete this reply?", confirmLabel: "Delete", danger: true })) { try { await api.remove(r.id); await load(); } catch (e) { toast(errorMessage(e), "error"); } } }}><Trash2 size={13} /></Button></div>
            </div>
          </Card>))}</div>
      )}
      {editing && <Editor reply={editing === "new" ? null : editing} flows={flowList} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Reply saved"); void load(); }} />}
    </Page>
  );
}

function Editor({ reply, flows, onClose, onSaved }: { reply: CustomReply | null; flows: FlowSummary[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ trigger: reply?.trigger ?? "", match_type: reply?.match_type ?? "contains", reply_text: reply?.reply_text ?? "", flow_id: reply?.flow_id ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = (f.match_type === "any" || f.trigger.trim()) && (f.reply_text.trim() || f.flow_id);
  return (
    <Modal open onClose={onClose} title={reply ? "Edit reply" : "New custom reply"} width={600}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!valid} onClick={async () => {
        setBusy(true); setErr(null);
        const body = { trigger: f.trigger, match_type: f.match_type, reply_text: f.reply_text, flow_id: f.flow_id || null };
        try { if (reply) await api.update(reply.id, body); else await api.create(body); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      }}>Save</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="space-y-4">
        <Field label="When the message…"><Select value={f.match_type} onChange={(e) => setF({ ...f, match_type: e.target.value as CustomReply["match_type"] })}><option value="contains">contains a keyword</option><option value="exact">exactly equals a keyword</option><option value="any">is anything (catch-all)</option></Select></Field>
        {f.match_type !== "any" && <Field label="Keywords" hint="Separate several with commas — any one triggers the reply. Not case-sensitive."><Input value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value })} placeholder="price, pricing, cost" autoFocus /></Field>}
        <Field label="Reply" hint="Merge fields: {{first_name}}, {{name}}, {{trait.city}}"><Textarea value={f.reply_text} onChange={(e) => setF({ ...f, reply_text: e.target.value })} maxLength={4096} placeholder="Our plans start at $19/month — see https://…" /></Field>
        <Field label="Then also run a flow (optional)" hint={flows.length ? undefined : "Publish a flow to use it here."}><Select value={f.flow_id} onChange={(e) => setF({ ...f, flow_id: e.target.value })}><option value="">No flow</option>{flows.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}
