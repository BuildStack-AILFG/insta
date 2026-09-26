"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, BadgeCheck, CircleDollarSign, MessageSquare, NotebookPen, Pencil, PlusCircle, Trash2, Trophy, XCircle } from "lucide-react";
import { Alert, Badge, Button, cx, Field, fmtDateTime, Input, Modal, Select, Spinner, Textarea, timeAgo, useDebounced, useUi } from "@/components/ui/kit";
import { contacts as contactsApi, errorMessage, inbox, pipeline, type Contact, type DealDetail, type Member, type PipelineStage } from "@/lib/api";
import { fmtMoney, fromMinor, toMinor } from "@/lib/money";
import PaymentLinkModal from "./PaymentLinkModal";

type Props = {
  /** null = creating a new deal. */
  dealId: string | null;
  stages: PipelineStage[];
  members: Member[];
  defaultStageId?: string;
  defaultContact?: { id: string; name: string } | null;
  onClose: () => void;
  onChanged: () => void;
};

function ContactPicker({ value, onChange }: { value: { id: string; name: string } | null; onChange: (c: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [results, setResults] = useState<Contact[]>([]);
  useEffect(() => {
    if (!dq.trim()) return;
    let live = true;
    contactsApi.list({ q: dq, limit: 6 }).then((r) => live && setResults(r.items)).catch(() => {});
    return () => { live = false; };
  }, [dq]);
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-field px-3 py-2 text-[13.5px] text-white">
        <span className="truncate">{value.name}</span>
        <button type="button" onClick={() => { onChange(null); setQ(""); setResults([]); }} className="text-[12px] text-white/50 hover:text-white">Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts by name or number (optional)" />
      {q.trim() && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-surface shadow-xl">
          {results.map((c) => (
            <button key={c.id} type="button" onClick={() => onChange({ id: c.id, name: c.name })} className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-white/[0.06]">
              <span className="truncate text-white">{c.name}</span><span className="text-white/40">{c.username ? `@${c.username}` : c.phone ? `+${c.phone}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ACTIVITY_ICON: Record<string, typeof PlusCircle> = { created: PlusCircle, stage_changed: ArrowRightLeft, note: NotebookPen, won: Trophy, lost: XCircle, reopened: BadgeCheck, payment: CircleDollarSign, updated: Pencil };

function describe(a: DealDetail["activity"][number]): string {
  const d = a.data;
  switch (a.kind) {
    case "created": return `Deal created in ${String(d.stage ?? "the pipeline")}${d.source && d.source !== "manual" ? ` (from ${String(d.source)})` : ""}`;
    case "stage_changed": return `Moved from ${String(d.from)} to ${String(d.to)}`;
    case "won": return "Marked as won";
    case "lost": return d.reason ? `Marked as lost — ${String(d.reason)}` : "Marked as lost";
    case "reopened": return "Re-opened";
    case "payment": return `Payment received — ${fmtMoney(Number(d.amount ?? 0), String(d.currency ?? "INR"))}`;
    case "note": return String(d.text ?? "");
    case "updated": return `Updated ${Object.keys((d.changes as Record<string, unknown>) ?? {}).join(", ") || "details"}`;
    default: return a.kind;
  }
}

export default function DealModal({ dealId, stages, members, defaultStageId, defaultContact, onClose, onChanged }: Props) {
  const { toast, confirm } = useUi();
  const router = useRouter();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(!!dealId);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState(defaultStageId ?? stages.find((s) => s.kind === "open")?.id ?? "");
  const [owner, setOwner] = useState("");
  const [close, setClose] = useState("");
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState<{ id: string; name: string } | null>(defaultContact ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const hydrate = (d: DealDetail) => {
    setDeal(d);
    setTitle(d.title);
    setValue(d.value ? fromMinor(d.value) : "");
    setStageId(d.stage_id);
    setOwner(d.owner_user_id ?? "");
    setClose(d.expected_close ?? "");
    setNotes(d.notes ?? "");
    setContact(d.contact_id ? { id: d.contact_id, name: d.contact_name ?? "Contact" } : null);
  };

  useEffect(() => {
    if (!dealId) return;
    let live = true;
    pipeline.deal(dealId).then((d) => { if (live) { hydrate(d); setLoading(false); } }).catch((e) => { if (live) { setError(errorMessage(e, "Couldn't load the deal.")); setLoading(false); } });
    return () => { live = false; };
  }, [dealId]);

  const save = async () => {
    const minor = value.trim() ? toMinor(value) : 0;
    if (!title.trim()) return setError("Give the deal a title.");
    if (minor === null) return setError("Enter the value as a number, like 25000 or 1250.50.");
    setBusy(true);
    setError(null);
    try {
      if (deal) {
        let d = await pipeline.update(deal.id, { title: title.trim(), value: minor, contact_id: contact?.id ?? null, owner_user_id: owner || null, expected_close: close || null, notes: notes.trim() || null });
        if (stageId !== deal.stage_id) d = await pipeline.move(deal.id, { stage_id: stageId });
        hydrate(d);
        toast("Deal saved");
      } else {
        await pipeline.create({ title: title.trim(), value: minor, stage_id: stageId || null, contact_id: contact?.id ?? null, owner_user_id: owner || null, expected_close: close || null, notes: notes.trim() || null });
        toast("Deal added");
        onChanged();
        onClose();
        return;
      }
      onChanged();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the deal."));
    } finally {
      setBusy(false);
    }
  };

  const closeAs = async (kind: "won" | "lost") => {
    if (!deal) return;
    const target = stages.find((s) => s.kind === kind);
    if (!target) return;
    let reason: string | undefined;
    if (kind === "lost") {
      const r = window.prompt("Why was this deal lost? (optional)");
      if (r === null) return;
      reason = r.trim() || undefined;
    }
    try {
      hydrate(await pipeline.move(deal.id, { stage_id: target.id, lost_reason: reason }));
      onChanged();
      toast(kind === "won" ? "Deal won 🎉" : "Deal marked as lost");
    } catch (e) { toast(errorMessage(e), "error"); }
  };

  const addNote = async () => {
    if (!deal || !note.trim()) return;
    try { hydrate(await pipeline.note(deal.id, note.trim())); setNote(""); } catch (e) { toast(errorMessage(e), "error"); }
  };

  const openChat = async () => {
    if (!deal?.contact_id) return;
    try { const conv = await inbox.start(deal.contact_id); router.push(`/dashboard/inbox?c=${conv.id}`); } catch (e) { toast(errorMessage(e), "error"); }
  };

  const remove = async () => {
    if (!deal || !(await confirm({ title: "Delete this deal?", body: "Its history is deleted too. This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
    try { await pipeline.remove(deal.id); onChanged(); onClose(); toast("Deal deleted"); } catch (e) { toast(errorMessage(e), "error"); }
  };

  const stage = stages.find((s) => s.id === (deal?.stage_id ?? stageId));

  return (
    <>
      <Modal open onClose={onClose} title={dealId ? "Deal" : "New deal"} width={dealId ? 860 : 520}
        footer={
          <>
            {deal && <Button variant="danger" onClick={remove} className="mr-auto"><Trash2 size={14} /> Delete</Button>}
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button loading={busy} onClick={save}>{deal ? "Save changes" : "Add deal"}</Button>
          </>
        }>
        {loading ? <Spinner /> : (
          <div className={cx("grid gap-6", dealId && "md:grid-cols-[1.1fr_1fr]")}>
            <div className="space-y-4">
              {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
              {deal && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={deal.status === "won" ? "green" : deal.status === "lost" ? "red" : "blue"}>{deal.status === "open" ? stage?.name : deal.status === "won" ? "Won" : "Lost"}</Badge>
                  {deal.status === "open" && (
                    <>
                      <Button size="sm" variant="soft" onClick={() => closeAs("won")}><Trophy size={13} /> Mark won</Button>
                      <Button size="sm" variant="soft" onClick={() => closeAs("lost")}><XCircle size={13} /> Mark lost</Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setPaying(true)}><CircleDollarSign size={13} /> Request payment</Button>
                  {deal.contact_id && <button type="button" onClick={openChat} className="inline-flex items-center gap-1 text-[12.5px] text-sky-300 hover:underline"><MessageSquare size={13} /> Open chat</button>}
                </div>
              )}
              <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Annual plan — Sharma Traders" autoFocus={!dealId} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Value (₹)"><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="25,000" /></Field>
                <Field label="Stage">
                  <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
                </Field>
              </div>
              <Field label="Contact"><ContactPicker value={contact} onChange={setContact} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Owner">
                  <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
                    <option value="">Unassigned</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
                  </Select>
                </Field>
                <Field label="Expected close"><Input type="date" value={close} onChange={(e) => setClose(e.target.value)} /></Field>
              </div>
              <Field label="Notes"><Textarea rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What does the customer need? Next steps…" /></Field>
              {deal?.status === "lost" && deal.lost_reason && <p className="text-[12.5px] text-red-300/80">Lost reason: {deal.lost_reason}</p>}
            </div>

            {deal && (
              <div className="min-w-0">
                <h3 className="mb-3 text-[13.5px] font-semibold text-white">Activity</h3>
                <div className="mb-4 flex gap-2">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addNote()} placeholder="Add a note…" maxLength={2000} />
                  <Button variant="soft" onClick={addNote} disabled={!note.trim()}>Add</Button>
                </div>
                <ol className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
                  {deal.activity.map((a) => {
                    const Icon = ACTIVITY_ICON[a.kind] ?? PlusCircle;
                    return (
                      <li key={a.id} className="flex gap-2.5 text-[13px]">
                        <Icon size={15} className="mt-0.5 shrink-0 text-white/40" />
                        <div className="min-w-0"><p className={cx("break-words", a.kind === "note" ? "rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-white/85" : "text-white/70")}>{describe(a)}</p>
                          <p className="mt-0.5 text-[11.5px] text-white/35" title={fmtDateTime(a.created_at)}>{a.user ? `${a.user} · ` : ""}{timeAgo(a.created_at)}</p></div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        )}
      </Modal>
      {paying && deal && <PaymentLinkModal open onClose={() => { setPaying(false); void pipeline.deal(deal.id).then(hydrate).catch(() => {}); }} contact={contact} deal={{ id: deal.id, title: deal.title, value: deal.value }} />}
    </>
  );
}
