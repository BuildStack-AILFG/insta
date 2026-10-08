"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Download, Handshake, Plus, Search, Settings2, UserRound } from "lucide-react";
import { Alert, Button, Card, cx, EmptyState, Input, Modal, Page, PageHeader, Select, Spinner, useDebounced, usePoll, useUi } from "@/components/ui/kit";
import { errorMessage, pipeline, team, type Deal, type Member, type PipelineBoard, type PipelineStage } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import DealModal from "@/components/sales/DealModal";
import StageManager from "@/components/sales/StageManager";

type Column = PipelineBoard["stages"][number];

function initials(name: string | null): string {
  return (name ?? "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function DealCard({ deal, dragging, onOpen, onDragStart, onDragEnd }: { deal: Deal; dragging: boolean; onOpen: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  const overdue = deal.status === "open" && deal.expected_close && new Date(deal.expected_close + "T23:59:59") < new Date();
  return (
    <div role="button" tabIndex={0} draggable onClick={onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())} onDragStart={onDragStart} onDragEnd={onDragEnd} data-deal={deal.id}
      className={cx("cursor-grab select-none rounded-xl border border-white/10 bg-card p-3 text-left shadow-sm transition hover:border-white/25 active:cursor-grabbing", dragging && "opacity-40")}>
      <p className="line-clamp-2 text-[13.5px] font-medium text-white">{deal.title}</p>
      {deal.contact_name && <p className="mt-1 truncate text-[12px] text-white/50">{deal.contact_name}</p>}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-white">{deal.value ? fmtMoney(deal.value, deal.currency) : <span className="font-normal text-white/30">No value</span>}</span>
        <div className="flex items-center gap-2 text-[11.5px] text-white/45">
          {deal.expected_close && <span className={cx("flex items-center gap-1", overdue && "text-red-300")} title="Expected close"><CalendarClock size={11} />{new Date(deal.expected_close + "T00:00:00").toLocaleDateString([], { day: "numeric", month: "short" })}</span>}
          {deal.owner_name && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-[9.5px] font-semibold text-brand" title={deal.owner_name}>{initials(deal.owner_name)}</span>}
        </div>
      </div>
    </div>
  );
}

function BoardView() {
  const { toast } = useUi();
  const params = useSearchParams();
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [owner, setOwner] = useState("");
  const [open, setOpen] = useState<{ id: string | null; stageId?: string } | null>(params.get("new") ? { id: null } : null);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ stage: string; index: number } | null>(null);
  const [lostFor, setLostFor] = useState<{ deal: Deal; stageId: string; position: number } | null>(null);
  const [reason, setReason] = useState("");
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    try { setBoard(await pipeline.board({ q: dq || undefined, owner: owner || undefined })); setError(null); } catch (e) { setError(errorMessage(e, "Couldn't load your pipeline.")); }
  }, [dq, owner]);
  useEffect(() => { void load(); }, [load]);
  usePoll(load, 30_000, [load]);
  useEffect(() => { team.members().then(setMembers).catch(() => {}); }, []);

  const stages: PipelineStage[] = useMemo(() => board?.stages ?? [], [board]);
  const openStages = board?.stages.filter((s) => s.kind === "open") ?? [];
  const totals = {
    count: openStages.reduce((n, s) => n + s.count, 0),
    value: openStages.reduce((n, s) => n + s.value, 0),
    weighted: openStages.reduce((n, s) => n + (s.value * s.probability) / 100, 0),
    won: board?.stages.filter((s) => s.kind === "won").reduce((n, s) => n + s.value, 0) ?? 0,
  };

  const commitMove = async (deal: Deal, stageId: string, position: number, lostReason?: string) => {
    if (!board) return;
    // optimistic: pull the card out of its column and drop it into the target at `position`
    const next: PipelineBoard = { stages: board.stages.map((s) => ({ ...s, deals: s.deals.filter((d) => d.id !== deal.id) })) };
    const target = next.stages.find((s) => s.id === stageId);
    if (!target) return;
    target.deals.splice(Math.min(position, target.deals.length), 0, { ...deal, stage_id: stageId, status: target.kind });
    setBoard(next);
    busy.current = true;
    try {
      await pipeline.move(deal.id, { stage_id: stageId, position, lost_reason: lostReason });
      if (target.kind === "won" && deal.stage_id !== stageId) toast("Deal won 🎉");
    } catch (e) { toast(errorMessage(e, "Couldn't move the deal."), "error"); }
    busy.current = false;
    await load();
  };

  const drop = (stage: Column, index: number) => {
    const deal = board?.stages.flatMap((s) => s.deals).find((d) => d.id === drag);
    setDrag(null);
    setOver(null);
    if (!deal) return;
    // index is measured against the column as displayed; if the card came from this column above the slot, the slot shifts up by one
    const fromIndex = stage.deals.findIndex((d) => d.id === deal.id);
    const position = fromIndex >= 0 && fromIndex < index ? index - 1 : index;
    if (fromIndex === position && deal.stage_id === stage.id) return;
    if (stage.kind === "lost" && deal.stage_id !== stage.id) { setReason(""); setLostFor({ deal, stageId: stage.id, position }); return; }
    void commitMove(deal, stage.id, position);
  };

  const slotFor = (e: React.DragEvent, stage: Column): number => {
    const cards = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-deal]"));
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) return i;
    }
    return stage.deals.length;
  };

  if (!board) return error ? <Alert>{error}</Alert> : <Spinner />;
  const empty = board.stages.every((s) => s.count === 0) && !dq && !owner;

  return (
    <>
      <PageHeader icon={<Handshake size={20} />} title="Sales pipeline" subtitle="Track every conversation from first hello to closed deal. Drag cards between stages as they progress."
        actions={<>
          <div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals or contacts" aria-label="Search deals" className="!w-56 !pl-8" /></div>
          {members.length > 1 && <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Filter by owner" className="!w-40"><option value="">All owners</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</Select>}
          <Button variant="ghost" onClick={() => void pipeline.exportCsv().catch((e) => toast(errorMessage(e), "error"))}><Download size={14} /> Export</Button>
          <Button variant="ghost" onClick={() => setStagesOpen(true)}><Settings2 size={14} /> Stages</Button>
          <Button onClick={() => setOpen({ id: null })}><Plus size={14} /> Add deal</Button>
        </>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Open deals", value: totals.count.toLocaleString() },
          { label: "Pipeline value", value: fmtMoney(totals.value, "INR", { compact: true }) },
          { label: "Weighted forecast", value: fmtMoney(Math.round(totals.weighted), "INR", { compact: true }), hint: "Value × win probability" },
          { label: "Won", value: fmtMoney(totals.won, "INR", { compact: true }) },
        ].map((k) => (
          <Card key={k.label} className="px-4 py-3"><p className="text-[12px] text-white/45">{k.label}</p><p className="mt-0.5 text-[20px] font-semibold text-white">{k.value}</p>{k.hint && <p className="text-[11px] text-white/30">{k.hint}</p>}</Card>
        ))}
      </div>

      {empty ? (
        <Card className="p-2"><EmptyState icon={<UserRound size={22} />} title="Your pipeline is empty" body="Add your first deal, or let new Instagram contacts become deals automatically — turn that on under Stages."
          action={<div className="flex gap-2"><Button onClick={() => setOpen({ id: null })}><Plus size={14} /> Add a deal</Button><Button variant="ghost" onClick={() => setStagesOpen(true)}>Set up stages</Button></div>} /></Card>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <div className="flex min-w-max gap-3">
            {board.stages.map((s) => (
              <section key={s.id} aria-label={s.name} className={cx("flex w-[min(286px,82vw)] shrink-0 flex-col rounded-2xl border bg-white/[0.02] transition", over?.stage === s.id ? "border-brand/60 bg-brand/[0.04]" : "border-white/10")}
                onDragOver={(e) => { if (!drag) return; e.preventDefault(); setOver({ stage: s.id, index: slotFor(e, s) }); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
                onDrop={(e) => { e.preventDefault(); drop(s, slotFor(e, s)); }}>
                <header className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3">
                  <div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} /><h3 className="truncate text-[13.5px] font-semibold text-white">{s.name}</h3><span className="rounded-full bg-white/[0.08] px-1.5 text-[11.5px] text-white/60">{s.count}</span></div>
                  <button aria-label={`Add deal to ${s.name}`} onClick={() => setOpen({ id: null, stageId: s.id })} className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white"><Plus size={15} /></button>
                </header>
                <p className="px-3.5 pb-2 text-[12px] text-white/40">{fmtMoney(s.value, "INR", { compact: true })}{s.kind === "open" && s.probability ? ` · ${s.probability}% likely` : ""}</p>
                <div className="flex min-h-[80px] flex-1 flex-col gap-2 px-2.5 pb-3">
                  {s.deals.map((d, i) => (
                    <div key={d.id}>
                      {over?.stage === s.id && over.index === i && drag && drag !== d.id && <div className="mb-2 h-1 rounded-full bg-brand" />}
                      <DealCard deal={d} dragging={drag === d.id} onOpen={() => setOpen({ id: d.id })} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", d.id); setDrag(d.id); }} onDragEnd={() => { setDrag(null); setOver(null); }} />
                    </div>
                  ))}
                  {over?.stage === s.id && over.index >= s.deals.length && drag && <div className="h-1 rounded-full bg-brand" />}
                  {s.deals.length === 0 && !drag && <p className="m-auto py-5 text-center text-[12px] text-white/25">No deals</p>}
                  {s.count > s.deals.length && <p className="pt-1 text-center text-[11.5px] text-white/35">+{s.count - s.deals.length} more — search to find them</p>}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {open && <DealModal key={open.id ?? `new-${open.stageId ?? ""}`} dealId={open.id} stages={stages} members={members} defaultStageId={open.stageId} onClose={() => setOpen(null)} onChanged={() => void load()} />}
      <StageManager open={stagesOpen} onClose={() => setStagesOpen(false)} onChanged={() => void load()} />
      <Modal open={!!lostFor} onClose={() => setLostFor(null)} title="Mark deal as lost" width={440}
        footer={<><Button variant="ghost" onClick={() => setLostFor(null)}>Cancel</Button><Button variant="danger" onClick={() => { const l = lostFor!; setLostFor(null); void commitMove(l.deal, l.stageId, l.position, reason.trim() || undefined); }}>Mark as lost</Button></>}>
        <p className="mb-3 text-[13px] text-white/60">Why did <b className="text-white">{lostFor?.deal.title}</b> fall through? Reasons show up in your sales report.</p>
        <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Budget, went with a competitor, no response" maxLength={200} />
      </Modal>
    </>
  );
}

export default function PipelinePage() {
  return <Page wide><Suspense fallback={<Spinner />}><BoardView /></Suspense></Page>;
}
