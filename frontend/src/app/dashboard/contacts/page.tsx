"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Download, MessageSquare, Plus, Search, Trash2, Upload, UserX, UserCheck, X } from "lucide-react";
import { Alert, Badge, Button, Card, cx, EmptyState, Field, fmtDateTime, Input, Modal, Page, PageHeader, Select, Spinner, timeAgo, Toggle, useDebounced, useUi } from "@/components/ui/kit";
import { contacts as api, errorMessage, getSettings, inbox, segments as segApi, type Contact, type ContactDetail, type Segment } from "@/lib/api";
import { useHasFeature } from "@/components/dashboard/UpgradeGate";

const PAGE = 25;

export default function ContactsPage() {
  const { toast, confirm } = useUi();
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [tag, setTag] = useState("");
  const [optOut, setOptOut] = useState("");
  const [segment, setSegment] = useState("");
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [segs, setSegs] = useState<Segment[]>([]);
  const hasSegments = useHasFeature("segments");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const filters = { q: dq || undefined, tag: tag || undefined, opted_out: optOut === "" ? undefined : optOut === "yes", segment_id: segment || undefined };
  const load = useCallback(async () => {
    try {
      const r = await api.list({ ...filters, sort: "created", limit: PAGE, offset: page * PAGE });
      setRows(r.items);
      setTotal(r.total);
      setError(null);
    } catch (e) { setError(errorMessage(e, "Couldn't load contacts.")); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, tag, optOut, segment, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(0); setSelected(new Set()); }, [dq, tag, optOut, segment]);
  const loadMeta = useCallback(() => { api.tags().then(setTags).catch(() => {}); if (hasSegments) segApi.list().then(setSegs).catch(() => {}); }, [hasSegments]);
  useEffect(loadMeta, [loadMeta]);

  const allSelected = !!rows?.length && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows?.map((r) => r.id)));
  const bulk = async (action: "add_tag" | "remove_tag" | "opt_out" | "opt_in" | "delete", tagName?: string) => {
    if (action === "delete" && !(await confirm({ title: `Delete ${selected.size} contact${selected.size === 1 ? "" : "s"}?`, body: "Their conversations and history are removed too. This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
    try {
      const r = await api.bulk({ ids: [...selected], action, tag: tagName });
      toast(`${r.affected} contact${r.affected === 1 ? "" : "s"} updated`);
      setSelected(new Set());
      await load();
      loadMeta();
    } catch (e) { toast(errorMessage(e), "error"); }
  };
  const bulkTag = async () => {
    const t = window.prompt("Tag to add to the selected contacts:");
    if (t?.trim()) await bulk("add_tag", t.trim());
  };

  return (
    <Page wide>
      <PageHeader icon={<ClipboardCheck size={20} />} title="Contacts" subtitle="Everyone who DMs you, comments on your posts or replies to your stories — plus leads you import. Tag people and group them into segments."
        actions={<>
          <Button variant="ghost" onClick={() => api.exportCsv(filters).catch((e) => toast(errorMessage(e), "error"))}><Download size={15} /> Export</Button>
          <Button variant="ghost" onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</Button>
          <Button onClick={() => setShowAdd(true)}><Plus size={15} /> Add contact</Button>
        </>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or email" className="pl-9" aria-label="Search contacts" />
        </div>
        <Select value={tag} onChange={(e) => setTag(e.target.value)} className="!w-44" aria-label="Filter by tag"><option value="">All tags</option>{tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}</Select>
        {hasSegments && <Select value={segment} onChange={(e) => setSegment(e.target.value)} className="!w-44" aria-label="Filter by segment"><option value="">All segments</option>{segs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
        <Select value={optOut} onChange={(e) => setOptOut(e.target.value)} className="!w-40" aria-label="Filter by consent"><option value="">Any consent</option><option value="no">Subscribed</option><option value="yes">Opted out</option></Select>
      </Card>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[13px]">
          <span className="font-medium text-white">{selected.size} selected</span>
          <Button size="sm" variant="ghost" onClick={bulkTag}><Plus size={13} /> Add tag</Button>
          <Button size="sm" variant="ghost" onClick={() => bulk("opt_out")}><UserX size={13} /> Opt out</Button>
          <Button size="sm" variant="ghost" onClick={() => bulk("opt_in")}><UserCheck size={13} /> Opt in</Button>
          <Button size="sm" variant="danger" onClick={() => bulk("delete")}><Trash2 size={13} /> Delete</Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-white/50 hover:text-white" aria-label="Clear selection"><X size={15} /></button>
        </div>
      )}

      {!rows ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={22} />} title={dq || tag || segment || optOut ? "No contacts match these filters" : "No contacts yet"}
          body={dq || tag || segment || optOut ? undefined : "Add someone manually, import a CSV, or just wait — anyone who DMs or comments on your Instagram is added automatically."}
          action={!dq && !tag && !segment && !optOut ? <Button onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</Button> : undefined} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-[13px]">
            <thead className="border-b border-white/10 text-[11.5px] uppercase tracking-wide text-white/40">
              <tr>
                <th className="w-10 px-4 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all on this page" className="accent-brand" /></th>
                <th className="px-2 py-3">Name</th><th className="px-2 py-3">Instagram / phone</th><th className="hidden px-2 py-3 md:table-cell">Tags</th><th className="hidden px-2 py-3 lg:table-cell">Source</th>
                <th className="hidden px-2 py-3 lg:table-cell">Last contacted</th><th className="px-2 py-3">Consent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => setDetail(c.id)} className="cursor-pointer border-b border-white/5 hover:bg-white/[0.04]">
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} aria-label={`Select ${c.name}`} className="accent-brand" /></td>
                  <td className="px-2 py-3 font-medium text-white">{c.name}{c.email && <div className="text-[11.5px] font-normal text-white/40">{c.email}</div>}</td>
                  <td className="px-2 py-3 text-white/70">{c.username ? `@${c.username}` : c.phone ? `+${c.phone}` : "—"}</td>
                  <td className="hidden px-2 py-3 md:table-cell"><div className="flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}{c.tags.length > 3 && <Badge>+{c.tags.length - 3}</Badge>}</div></td>
                  <td className="hidden px-2 py-3 text-white/55 lg:table-cell">{c.source}</td>
                  <td className="hidden px-2 py-3 text-white/55 lg:table-cell">{timeAgo(c.last_contacted_at)}</td>
                  <td className="px-2 py-3">{c.opted_out ? <Badge tone="red">Opted out</Badge> : <Badge tone="green">Automations on</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-[12.5px] text-white/50">
            <span>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total.toLocaleString()}</span>
            <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
          </div>
        </Card>
      )}

      <AddModal open={showAdd} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); toast("Contact added"); void load(); loadMeta(); }} />
      <ImportModal open={showImport} onClose={() => setShowImport(false)} onDone={() => { void load(); loadMeta(); }} />
      <Drawer id={detail} onClose={() => setDetail(null)} onChanged={() => { void load(); loadMeta(); }} />
    </Page>
  );
}

function AddModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", tags: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Add contact"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!f.name.trim() || !f.phone.trim()} onClick={async () => {
        setBusy(true); setErr(null);
        try { await api.create({ name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() || undefined, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) }); setF({ name: "", phone: "", email: "", tags: "" }); onDone(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      }}>Add</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Phone (with country code)"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91 98765 43210" /></Field>
        <Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Tags (comma separated)"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="vip, lead" /></Field>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cc, setCc] = useState("");
  const [tag, setTag] = useState("");
  const [update, setUpdate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Awaited<ReturnType<typeof api.importCsv>> | null>(null);
  useEffect(() => { if (open) getSettings().then((s) => setCc(String(s.settings.default_country_code ?? ""))).catch(() => {}); }, [open]);
  const close = () => { setFile(null); setRes(null); setErr(null); onClose(); };
  return (
    <Modal open={open} onClose={close} title="Import contacts from CSV" width={620}
      footer={res ? <Button onClick={close}>Done</Button> : <><Button variant="ghost" onClick={close}>Cancel</Button><Button loading={busy} disabled={!file} onClick={async () => {
        setBusy(true); setErr(null);
        try { setRes(await api.importCsv(file!, { default_country_code: cc, update_existing: update, add_tag: tag })); onDone(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      }}>Import</Button></>}>
      {err && <Alert>{err}</Alert>}
      {res ? (
        <div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Card className="p-3"><div className="text-[22px] font-semibold text-pink-300">{res.created}</div><div className="text-[12px] text-white/50">created</div></Card>
            <Card className="p-3"><div className="text-[22px] font-semibold text-sky-300">{res.updated}</div><div className="text-[12px] text-white/50">updated</div></Card>
            <Card className="p-3"><div className="text-[22px] font-semibold text-amber-300">{res.skipped}</div><div className="text-[12px] text-white/50">skipped</div></Card>
          </div>
          {res.errors.length > 0 && (
            <div className="mt-4"><div className="mb-2 text-[12.5px] font-medium text-white/70">Rows that were skipped</div>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10 text-[12.5px]">{res.errors.map((e) => <div key={e.row} className="flex gap-3 border-b border-white/5 px-3 py-2"><span className="w-14 shrink-0 text-white/40">Row {e.row}</span><span className="text-white/75">{e.error}</span></div>)}</div>
              {res.more_errors > 0 && <div className="mt-1 text-[11.5px] text-white/40">…and {res.more_errors} more</div>}</div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-white/20 p-6 text-center">
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Upload size={22} className="mx-auto text-white/40" />
            <div className="mt-2 text-[13.5px] text-white">{file ? file.name : "Choose a CSV file"}</div>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => fileRef.current?.click()}>{file ? "Change file" : "Browse"}</Button>
          </div>
          <p className="text-[12.5px] text-white/50">Needs a <b>phone</b> column (also: mobile, number). Imported leads show up on their Instagram profile once they DM you. Optional: <b>name, email, tags</b> (separate with ;). Every other column is saved as a custom detail you can use in messages, e.g. <code>{"{{trait.city}}"}</code>. Up to 20,000 rows / 5 MB.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Default country code" hint="For numbers written without +country"><Input value={cc} onChange={(e) => setCc(e.target.value.replace(/\D/g, ""))} placeholder="91" /></Field>
            <Field label="Add tag to everyone (optional)"><Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="webinar-sept" /></Field>
          </div>
          <label className="flex items-center gap-3 text-[13px] text-white/70"><Toggle checked={update} onChange={setUpdate} label="Update existing" /> Update contacts that already exist</label>
        </div>
      )}
    </Modal>
  );
}

function Drawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const { toast, confirm } = useUi();
  const [c, setC] = useState<ContactDetail | null>(null);
  const [f, setF] = useState({ name: "", email: "", tags: "" });
  const [traits, setTraits] = useState<[string, string][]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setC(null); setErr(null);
    if (!id) return;
    api.get(id).then((d) => { setC(d); setF({ name: d.name, email: d.email ?? "", tags: d.tags.join(", ") }); setTraits(Object.entries(d.traits).map(([k, v]) => [k, String(v)])); }).catch((e) => setErr(errorMessage(e)));
  }, [id]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.update(id!, { name: f.name, email: f.email || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), traits: Object.fromEntries(traits.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v])) });
      toast("Contact saved"); onChanged(); onClose();
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const message = async () => {
    try { const conv = await inbox.start(id!); router.push(`/dashboard/inbox?c=${conv.id}`); } catch (e) { setErr(errorMessage(e)); }
  };

  return (
    <Modal open={!!id} onClose={onClose} title={c?.name ?? "Contact"} width={640}
      footer={c ? <>
        <Button variant="danger" className="mr-auto" onClick={async () => { if (await confirm({ title: "Delete this contact?", body: "Their conversations are deleted too.", confirmLabel: "Delete", danger: true })) { try { await api.remove(id!); toast("Contact deleted"); onChanged(); onClose(); } catch (e) { setErr(errorMessage(e)); } } }}><Trash2 size={14} /> Delete</Button>
        <Button variant="ghost" onClick={message}><MessageSquare size={14} /> Message</Button><Button loading={busy} onClick={save}>Save</Button></> : undefined}>
      {err && <Alert>{err}</Alert>}
      {!c ? (err ? null : <Spinner />) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Instagram"><Input value={c.username ? `@${c.username}` : "Hasn't messaged yet"} readOnly disabled /></Field>
            <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Tags (comma separated)"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><span className="text-[12.5px] font-medium text-white/70">Custom details</span><Button size="sm" variant="ghost" onClick={() => setTraits([...traits, ["", ""]])}><Plus size={12} /> Add</Button></div>
            {traits.length === 0 && <div className="text-[12px] text-white/35">No details yet. Use these in messages as {"{{trait.name}}"}.</div>}
            {traits.map(([k, v], i) => (
              <div key={i} className="mb-2 flex gap-2"><Input value={k} onChange={(e) => setTraits(traits.map((t, j) => (j === i ? [e.target.value, t[1]] : t)))} placeholder="field" /><Input value={v} onChange={(e) => setTraits(traits.map((t, j) => (j === i ? [t[0], e.target.value] : t)))} placeholder="value" />
                <button onClick={() => setTraits(traits.filter((_, j) => j !== i))} className="px-2 text-white/40 hover:text-red-300" aria-label="Remove detail"><X size={15} /></button></div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 text-[13px]"><span className="text-white/70">Opted out of marketing messages</span>
            <Toggle checked={c.opted_out} onChange={async (v) => { try { const u = await api.update(c.id, { opted_out: v }); setC({ ...c, opted_out: u.opted_out }); onChanged(); } catch (e) { setErr(errorMessage(e)); } }} label="Opted out" /></div>
          <div>
            <div className="mb-2 text-[12.5px] font-medium text-white/70">Activity</div>
            {c.events.length === 0 ? <div className="text-[12px] text-white/35">No events recorded. Events arrive from integrations, the API and flows.</div> : (
              <ul className="space-y-1.5">{c.events.slice(0, 10).map((e, i) => <li key={i} className="flex justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[12.5px]"><span className="text-white/85">{e.name}<span className="ml-2 text-white/35">{Object.keys(e.properties).length ? JSON.stringify(e.properties).slice(0, 60) : ""}</span></span><span className="text-white/35">{fmtDateTime(e.at)}</span></li>)}</ul>
            )}
          </div>
          <div className={cx("text-[11.5px] text-white/35")}>Source: {c.source} · Added {fmtDateTime(c.created_at)}</div>
        </div>
      )}
    </Modal>
  );
}
