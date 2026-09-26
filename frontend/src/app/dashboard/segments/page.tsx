"use client";

import { useCallback, useEffect, useState } from "react";
import { Filter, Plus, Trash2, Users2, X } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Page, PageHeader, Select, Spinner, useUi } from "@/components/ui/kit";
import { contacts as contactsApi, errorMessage, segments as api, type Segment, type SegmentRule } from "@/lib/api";

const FIELDS: { id: string; label: string; ops: [string, string][]; input: "text" | "none" | "date" | "bool" }[] = [
  { id: "tag", label: "Has tag", ops: [["has", "has"], ["not_has", "doesn't have"]], input: "text" },
  { id: "name", label: "Name", ops: [["contains", "contains"], ["eq", "is"]], input: "text" },
  { id: "phone", label: "Phone", ops: [["contains", "contains"], ["eq", "is"]], input: "text" },
  { id: "email", label: "Email", ops: [["exists", "is set"], ["not_exists", "is empty"], ["contains", "contains"]], input: "text" },
  { id: "source", label: "Source", ops: [["eq", "is"]], input: "text" },
  { id: "opted_out", label: "Opted out", ops: [["is_true", "yes"], ["is_false", "no"]], input: "none" },
  { id: "created_after", label: "Added after", ops: [["eq", "date"]], input: "date" },
  { id: "created_before", label: "Added before", ops: [["eq", "date"]], input: "date" },
  { id: "last_contacted_before", label: "Not contacted since", ops: [["eq", "date"]], input: "date" },
  { id: "never_contacted", label: "Never contacted", ops: [["eq", "yes"]], input: "none" },
];

export default function SegmentsPage() {
  const { toast, confirm } = useUi();
  const [list, setList] = useState<Segment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Segment | "new" | null>(null);
  const load = useCallback(async () => { try { setList(await api.list()); } catch (e) { setError(errorMessage(e, "Couldn't load segments.")); } }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <Page>
      <PageHeader icon={<Users2 size={20} />} title="Segments" subtitle="Save a filter once and reuse it to find the right people — by tag, detail, event or engagement. Segments update automatically as your contacts change."
        actions={<Button onClick={() => setEditing("new")}><Plus size={15} /> New segment</Button>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      {!list ? <Spinner /> : list.length === 0 ? <EmptyState icon={<Filter size={22} />} title="No segments yet" body="Try “Tag is vip AND Added in the last 30 days”." action={<Button onClick={() => setEditing("new")}><Plus size={15} /> Create segment</Button>} /> : (
        <div className="grid gap-4 md:grid-cols-2">{list.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-start justify-between"><div><h3 className="text-[15px] font-semibold text-white">{s.name}</h3><div className="mt-0.5 text-[12.5px] text-white/45">{s.count.toLocaleString()} contacts (excluding opted out)</div></div>
              <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button>
                <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete “${s.name}”?`, body: "Contacts in it aren't affected.", confirmLabel: "Delete", danger: true })) { try { await api.remove(s.id); await load(); toast("Segment deleted"); } catch (e) { toast(errorMessage(e), "error"); } } }}><Trash2 size={13} /></Button></div></div>
            <div className="mt-3 flex flex-wrap gap-1.5">{s.filters.rules.map((r, i) => <Badge key={i}>{describe(r)}</Badge>)}<span className="self-center text-[11px] text-white/35">{s.filters.match === "any" ? "match any" : "match all"}</span></div>
          </Card>))}</div>
      )}
      {editing && <Editor seg={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Segment saved"); void load(); }} />}
    </Page>
  );
}

function describe(r: SegmentRule): string {
  const f = FIELDS.find((x) => x.id === r.field);
  if (r.field.startsWith("trait:")) return `${r.field.slice(6)} ${r.op === "eq" ? "=" : r.op} ${r.value ?? ""}`;
  if (r.field.startsWith("event:")) return `${r.op === "not_exists" ? "never did" : "did"} ${r.field.slice(6)}`;
  return `${f?.label ?? r.field}${r.value !== undefined && r.value !== "" ? `: ${r.value}` : ""}${f?.input === "none" ? ` (${f.ops.find((o) => o[0] === r.op)?.[1] ?? ""})` : ""}`;
}

function Editor({ seg, onClose, onSaved }: { seg: Segment | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(seg?.name ?? "");
  const [match, setMatch] = useState<"all" | "any">(seg?.filters.match ?? "all");
  const [rules, setRules] = useState<SegmentRule[]>(seg?.filters.rules ?? [{ field: "tag", op: "has", value: "" }]);
  const [traits, setTraits] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { contactsApi.traits().then(setTraits).catch(() => {}); }, []);
  const key = JSON.stringify([match, rules]);
  useEffect(() => {
    const t = setTimeout(() => api.preview({ match, rules }).then((r) => { setCount(r.count); setErr(null); }).catch((e) => { setCount(null); setErr(errorMessage(e)); }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const setRule = (i: number, r: SegmentRule) => setRules(rules.map((x, j) => (j === i ? r : x)));
  const fieldDef = (f: string) => FIELDS.find((x) => x.id === f);

  return (
    <Modal open onClose={onClose} title={seg ? "Edit segment" : "New segment"} width={720}
      footer={<><span className="mr-auto self-center text-[13px] text-white/50">{count === null ? "" : <><b className="text-white">{count.toLocaleString()}</b> matching contacts</>}</span><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} disabled={!name.trim() || rules.length === 0} onClick={async () => { setBusy(true); try { if (seg) await api.update(seg.id, { name, filters: { match, rules } }); else await api.create({ name, filters: { match, rules } }); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } }}>Save segment</Button></>}>
      {err && <Alert>{err}</Alert>}
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VIP customers in Pune" autoFocus /></Field>
      <div className="mt-4 mb-2 flex items-center gap-2 text-[13px] text-white/70">Contacts who match <Select value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")} className="!w-24 !py-1"><option value="all">all</option><option value="any">any</option></Select> of these rules:</div>
      <div className="space-y-2">{rules.map((r, i) => {
        const kind = r.field.startsWith("trait:") ? "trait" : r.field.startsWith("event:") ? "event" : r.field;
        const def = fieldDef(kind);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-2">
            <Select className="!w-44" value={kind} onChange={(e) => { const k = e.target.value; setRule(i, k === "trait" ? { field: `trait:${traits[0] ?? "city"}`, op: "eq", value: "" } : k === "event" ? { field: "event:order_placed", op: "exists" } : { field: k, op: fieldDef(k)!.ops[0][0], value: "" }); }} aria-label="Field">
              {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}<option value="trait">Custom detail…</option><option value="event">Did event…</option></Select>
            {kind === "trait" && <><Input className="!w-36" list="trait-list" value={r.field.slice(6)} onChange={(e) => setRule(i, { ...r, field: `trait:${e.target.value}` })} placeholder="field" /><datalist id="trait-list">{traits.map((t) => <option key={t} value={t} />)}</datalist>
              <Select className="!w-32" value={r.op} onChange={(e) => setRule(i, { ...r, op: e.target.value })}><option value="eq">is</option><option value="neq">is not</option><option value="contains">contains</option><option value="exists">is set</option><option value="not_exists">is empty</option></Select></>}
            {kind === "event" && <><Input className="!w-44" value={r.field.slice(6)} onChange={(e) => setRule(i, { ...r, field: `event:${e.target.value}` })} placeholder="event name" /><Select className="!w-32" value={r.op} onChange={(e) => setRule(i, { ...r, op: e.target.value })}><option value="exists">happened</option><option value="not_exists">never happened</option></Select></>}
            {def && kind !== "trait" && kind !== "event" && <Select className="!w-36" value={r.op} onChange={(e) => setRule(i, { ...r, op: e.target.value })}>{def.ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}
            {(kind === "trait" ? !["exists", "not_exists"].includes(r.op) : def?.input === "text" && !["exists", "not_exists"].includes(r.op)) && <Input className="min-w-[140px] flex-1" value={String(r.value ?? "")} onChange={(e) => setRule(i, { ...r, value: e.target.value })} placeholder="value" />}
            {def?.input === "date" && <Input type="date" className="!w-44" value={String(r.value ?? "")} onChange={(e) => setRule(i, { ...r, value: e.target.value })} />}
            <button onClick={() => setRules(rules.filter((_, j) => j !== i))} className="ml-auto px-1 text-white/40 hover:text-red-300" aria-label="Remove rule"><X size={15} /></button>
          </div>);
      })}</div>
      <Button size="sm" variant="ghost" className="mt-3" onClick={() => setRules([...rules, { field: "tag", op: "has", value: "" }])}><Plus size={13} /> Add rule</Button>
    </Modal>
  );
}
