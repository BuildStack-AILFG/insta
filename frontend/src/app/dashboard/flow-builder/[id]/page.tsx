"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, addEdge, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { ArrowLeft, CheckCircle2, ListChecks, Loader2, Play, Rocket, Undo2 } from "lucide-react";
import { Alert, Badge, Button, cx, Field, Input, Modal, Select, Spinner, statusTone, timeAgo, useUi } from "@/components/ui/kit";
import { contacts as contactsApi, errorMessage, flows as api, team, type Contact, type FlowExecution, type FlowFull, type Member } from "@/lib/api";
import Inspector from "@/components/flow/Inspector";
import { useTheme } from "@/lib/theme";
import { STEP_META, TRIGGERS, defaultData, outputsFor, summarize, uid } from "@/components/flow/model";

type StepData = { stepType: string; config: Record<string, unknown>; invalid?: boolean; running?: number };
type StepNode = Node<StepData, "step">;

function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  const meta = STEP_META[data.stepType];
  const outs = outputsFor({ type: data.stepType, data: data.config });
  const multi = outs.length > 1;
  return (
    <div className={cx("min-w-[220px] max-w-[260px] rounded-xl border bg-surface shadow-lg transition", selected ? "border-white/60 ring-2 ring-white/20" : data.invalid ? "border-red-500/60" : "border-white/15")}>
      {data.stepType !== "start" && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-surface !bg-white/70" />}
      <div className="flex items-center gap-2 rounded-t-xl px-3 py-2 text-[12px] font-semibold text-white" style={{ background: meta?.color ?? "#444" }}>
        {meta?.label ?? data.stepType}{!!data.running && <span className="ml-auto rounded-full bg-white/25 px-1.5 text-[10px]">{data.running} waiting</span>}
      </div>
      <div className="px-3 py-2.5 text-[12px] leading-snug text-white/70">{summarize({ type: data.stepType, data: data.config })}</div>
      {multi && <div className="border-t border-white/10 py-1">{outs.map(([id, label]) => <div key={id} className="relative px-3 py-1 text-right text-[11px] text-white/60">{label}<Handle id={id} type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-surface !bg-emerald-400" style={{ top: "50%" }} /></div>)}</div>}
      {!multi && outs.length === 1 && <Handle id={outs[0][0]} type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-surface !bg-emerald-400" />}
    </div>
  );
}
const nodeTypes = { step: StepNodeView };

const toRf = (g: FlowFull["graph"]): { nodes: StepNode[]; edges: Edge[] } => ({
  nodes: g.nodes.map((n) => ({ id: n.id, type: "step", position: n.position, data: { stepType: n.type, config: n.data } })),
  edges: g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? "next", animated: false, style: { stroke: "#94a3b8", strokeWidth: 1.5 } })),
});
const fromRf = (nodes: StepNode[], edges: Edge[]) => ({
  nodes: nodes.map((n) => ({ id: n.id, type: n.data.stepType, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data.config })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? "next" })),
});

export default function FlowEditorPage() {
  return <ReactFlowProvider><Editor /></ReactFlowProvider>;
}

function Editor() {
  const { isDark } = useTheme();
  const { id } = useParams<{ id: string }>();
  const { toast } = useUi();
  const rf = useReactFlow();
  const [flow, setFlow] = useState<FlowFull | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("incoming_message");
  const [save, setSave] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [err, setErr] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tab, setTab] = useState<"steps" | "runs">("steps");
  const [runs, setRuns] = useState<FlowExecution[]>([]);
  const [runDetail, setRunDetail] = useState<{ id: string; status: string; events: { at: string; node: string; type: string; detail: string }[]; context: Record<string, unknown>; error: string | null } | null>(null);
  const [showRun, setShowRun] = useState(false);
  const loaded = useRef(false);
  const dirtySeq = useRef(0);

  useEffect(() => {
    api.get(id).then((f) => { setFlow(f); setName(f.name); setTrigger(f.trigger_type); const g = toRf(f.graph); setNodes(g.nodes); setEdges(g.edges); setProblems(f.errors ?? []); loaded.current = true; }).catch((e) => setErr(errorMessage(e)));
    team.members().then(setMembers).catch(() => {});
  }, [id, setNodes, setEdges]);

  const markDirty = useCallback(() => { if (loaded.current) { dirtySeq.current++; setSave("dirty"); } }, []);
  const persist = useCallback(async (): Promise<FlowFull | null> => {
    setSave("saving");
    try {
      const f = await api.save(id, { name: name.trim() || "Untitled flow", trigger_type: trigger, graph: fromRf(nodes, edges) });
      setFlow(f); setProblems(f.errors ?? []); setSave("saved");
      return f;
    } catch (e) { setSave("error"); setErr(errorMessage(e)); return null; }
  }, [id, name, trigger, nodes, edges]);

  // debounced autosave
  useEffect(() => {
    if (save !== "dirty") return;
    const seq = dirtySeq.current;
    const t = setTimeout(() => { if (seq === dirtySeq.current) void persist(); }, 1200);
    return () => clearTimeout(t);
  }, [save, persist, nodes, edges, name, trigger]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (save === "dirty" || save === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  // highlight steps that have problems / waiting runs
  useEffect(() => {
    const bad = new Set(problems.flatMap((p) => nodes.filter((n) => p.includes(`'${STEP_META[n.data.stepType]?.label}'`) || p.includes(`'${String(n.data.config.label ?? "")}'`)).map((n) => n.id)));
    const waiting = runs.filter((r) => r.status === "waiting").reduce<Record<string, number>>((a, r) => { if (r.current_node) a[r.current_node] = (a[r.current_node] ?? 0) + 1; return a; }, {});
    setNodes((ns) => ns.map((n) => (n.data.invalid === bad.has(n.id) && (n.data.running ?? 0) === (waiting[n.id] ?? 0) ? n : { ...n, data: { ...n.data, invalid: bad.has(n.id), running: waiting[n.id] ?? 0 } })));
  }, [problems, runs]); // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback((c: Connection) => {
    const handle = c.sourceHandle ?? "next";
    setEdges((es) => addEdge({ ...c, sourceHandle: handle, id: `${c.source}-${handle}-${c.target}`, style: { stroke: "#94a3b8", strokeWidth: 1.5 } }, es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "next") === handle))));
    markDirty();
  }, [setEdges, markDirty]);

  const addStep = (type: string) => {
    const vp = rf.screenToFlowPosition({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 60 });
    const nid = uid(type);
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id: nid, type: "step", position: { x: vp.x + Math.random() * 40, y: vp.y + Math.random() * 40 }, data: { stepType: type, config: defaultData(type) }, selected: true }]);
    setSelected(nid); markDirty();
  };
  const sel = nodes.find((n) => n.id === selected);
  const updateSel = (config: Record<string, unknown>) => { setNodes((ns) => ns.map((n) => (n.id === selected ? { ...n, data: { ...n.data, config } } : n))); markDirty(); };
  const deleteSel = () => { if (!selected || sel?.data.stepType === "start") return; setNodes((ns) => ns.filter((n) => n.id !== selected)); setEdges((es) => es.filter((e) => e.source !== selected && e.target !== selected)); setSelected(null); markDirty(); };

  // drop edges that point at outputs that no longer exist (e.g. a deleted button)
  useEffect(() => {
    setEdges((es) => {
      const valid = (e: Edge) => { const n = nodes.find((x) => x.id === e.source); if (!n) return false; const outs = outputsFor({ type: n.data.stepType, data: n.data.config }).map((o) => o[0]); return outs.includes(e.sourceHandle ?? "next"); };
      const kept = es.filter(valid);
      return kept.length === es.length ? es : kept;
    });
  }, [nodes, setEdges]);

  const publish = async () => {
    setErr(null);
    const saved = await persist();
    if (!saved) return;
    try { const f = await api.publish(id); setFlow(f); setProblems([]); toast("Flow published — it's live"); } catch (e) { const ex = e as { problems?: string[] }; setProblems(ex.problems ?? []); setErr(errorMessage(e)); }
  };
  const unpublish = async () => { try { setFlow(await api.unpublish(id)); toast("Flow unpublished — running conversations were stopped"); } catch (e) { setErr(errorMessage(e)); } };
  const loadRuns = useCallback(async () => { try { setRuns(await api.executions(id)); } catch { /* ignore */ } }, [id]);
  useEffect(() => { if (tab === "runs" || flow?.status === "published") void loadRuns(); }, [tab, flow?.status, loadRuns]);
  useEffect(() => { if (tab !== "runs") return; const t = setInterval(loadRuns, 5000); return () => clearInterval(t); }, [tab, loadRuns]);

  const groups = useMemo(() => (["Messages", "Logic", "Contact", "Sales", "Advanced"] as const).map((g) => [g, Object.entries(STEP_META).filter(([k, m]) => m.group === g && k !== "start")] as const), []);
  if (!flow) return err ? <div className="p-6"><Alert>{err}</Alert></div> : <Spinner />;
  const trig = TRIGGERS.find((t) => t.id === trigger);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <Link href="/dashboard/flow-builder" className="rounded-md p-1.5 text-white/60 hover:bg-white/10" aria-label="Back to flows"><ArrowLeft size={18} /></Link>
        <Input value={name} onChange={(e) => { setName(e.target.value); markDirty(); }} className="!w-64 !bg-transparent font-semibold" aria-label="Flow name" />
        <Select value={trigger} onChange={(e) => { setTrigger(e.target.value); markDirty(); }} className="!w-56 !py-1.5 text-[12.5px]" aria-label="Trigger">{TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
        <Badge tone={statusTone(flow.status)}>{flow.status}{flow.has_unpublished_changes && " · edits not live"}</Badge>
        <span className="flex items-center gap-1.5 text-[12px] text-white/40">{save === "saving" ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : save === "dirty" ? "Unsaved changes" : save === "error" ? <span className="text-red-300">Save failed</span> : <><CheckCircle2 size={12} className="text-emerald-400" /> Saved</>}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowRun(true)} disabled={flow.status !== "published"} title={flow.status === "published" ? undefined : "Publish first"}><Play size={13} /> Test run</Button>
          {flow.status === "published" && <Button size="sm" variant="ghost" onClick={unpublish}><Undo2 size={13} /> Unpublish</Button>}
          <Button size="sm" onClick={publish}><Rocket size={13} /> {flow.status === "published" ? "Publish changes" : "Publish"}</Button>
        </div>
      </header>
      {err && <div className="px-4 pt-3"><Alert onClose={() => setErr(null)}>{err}</Alert></div>}
      {problems.length > 0 && <div className="mx-4 mt-3"><Alert tone="yellow"><div className="mb-1 font-medium">{problems.length} thing{problems.length === 1 ? "" : "s"} to fix before this flow can go live:</div><ul className="list-disc space-y-0.5 pl-5">{problems.slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}</ul></Alert></div>}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[210px] shrink-0 overflow-y-auto border-r border-white/10 p-3 md:block">
          <div className="mb-3 flex rounded-lg bg-white/[0.05] p-0.5 text-[12px]">{(["steps", "runs"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cx("flex-1 rounded-md py-1.5 capitalize", tab === t ? "bg-white/15 text-white" : "text-white/50")}>{t === "steps" ? "Add step" : "Runs"}</button>)}</div>
          {tab === "steps" ? groups.map(([g, items]) => (
            <div key={g} className="mb-4"><div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-white/35">{g}</div>
              {items.map(([k, m]) => <button key={k} onClick={() => addStep(k)} title={m.description} className="mb-1 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-[12.5px] text-white/80 hover:bg-white/[0.08]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />{m.label}</button>)}</div>
          )) : (
            <div className="space-y-1.5">{runs.length === 0 ? <p className="text-[12px] text-white/40">No runs yet. When contacts enter this flow they appear here.</p> : runs.map((r) => (
              <button key={r.id} onClick={() => api.execution(id, r.id).then(setRunDetail).catch((e) => setErr(errorMessage(e)))} className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-2 text-left hover:bg-white/[0.07]">
                <div className="flex items-center justify-between"><span className="truncate text-[12.5px] text-white">{r.contact.name}</span><Badge tone={statusTone(r.status)}>{r.status}</Badge></div><div className="text-[11px] text-white/35">{timeAgo(r.created_at)}</div></button>))}</div>
          )}
        </aside>

        <div className="relative min-w-0 flex-1">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }} minZoom={0.2} colorMode={isDark ? "dark" : "light"} deleteKeyCode={["Backspace", "Delete"]}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === "position" && x.dragging === false) || c.some((x) => x.type === "remove")) markDirty(); }}
            onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === "remove")) markDirty(); }} onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => setSelected(null)} onNodesDelete={(ns) => { if (ns.some((n) => n.data.stepType === "start")) { setNodes((cur) => (cur.some((n) => n.data.stepType === "start") ? cur : [...cur, ns.find((n) => n.data.stepType === "start")!])); } }}>
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="color-mix(in srgb, var(--foreground) 14%, transparent)" />
            <Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={(n) => STEP_META[(n as StepNode).data.stepType]?.color ?? "#555"} maskColor="color-mix(in srgb, var(--background) 65%, transparent)" className="!hidden lg:!block" />
          </ReactFlow>
          {trig && <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-lg bg-black/60 px-3 py-2 text-[11.5px] text-white/55 backdrop-blur"><ListChecks size={12} className="mr-1 inline" />{trig.hint}</div>}
        </div>

        <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-white/10 p-4 lg:block">
          {sel ? <Inspector key={sel.id} type={sel.data.stepType} data={sel.data.config} onChange={updateSel} onDelete={deleteSel} members={members} trigger={trigger} /> : <div className="pt-10 text-center text-[13px] text-white/40">Select a step to edit it.<br />Drag from a step&apos;s green dot to connect it to the next one.</div>}
        </aside>
      </div>

      <RunModal open={showRun} onClose={() => setShowRun(false)} flowId={id} onStarted={() => { setTab("runs"); void loadRuns(); }} />
      <Modal open={!!runDetail} onClose={() => setRunDetail(null)} title="Run details" width={620}>
        {runDetail && <div className="space-y-3"><div className="flex items-center gap-2"><Badge tone={statusTone(runDetail.status)}>{runDetail.status}</Badge>{runDetail.error && <span className="text-[12.5px] text-red-300">{runDetail.error}</span>}</div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10">{runDetail.events.map((ev, i) => <div key={i} className="flex gap-3 border-b border-white/5 px-3 py-1.5 text-[12px]"><span className="w-20 shrink-0 text-white/35">{new Date(ev.at).toLocaleTimeString()}</span><span className="w-28 shrink-0 text-white/70">{ev.type}</span><span className="truncate text-white/50">{ev.detail}</span></div>)}</div>
          {Object.keys(runDetail.context).length > 0 && <div><div className="mb-1 text-[12px] font-medium text-white/60">Collected variables</div><pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-[11.5px] text-white/70">{JSON.stringify(Object.fromEntries(Object.entries(runDetail.context).filter(([k]) => !k.startsWith("_"))), null, 2)}</pre></div>}</div>}
      </Modal>
    </div>
  );
}

function RunModal({ open, onClose, flowId, onStarted }: { open: boolean; onClose: () => void; flowId: string; onStarted: () => void }) {
  const { toast } = useUi();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [picked, setPicked] = useState<Contact | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { contactsApi.list({ q: q.trim() || undefined, limit: 8 }).then((r) => setResults(r.items)).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [q, open]);
  return (
    <Modal open={open} onClose={onClose} title="Test run" width={480} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button loading={busy} disabled={!picked} onClick={async () => { if (!picked) return; setBusy(true); setErr(null); try { const r = await api.run(flowId, { contact_id: picked.id }); toast(`Flow started (${r.status})`); onStarted(); onClose(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } }}><Play size={13} /> Start</Button></>}>
      {err && <Alert>{err}</Alert>}
      <Field label="Run the flow for this contact" hint="Message steps only reach people who DMed your account in the last 24 hours — DM your own business account from a test profile first."><Input value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="Search name or @username" autoFocus /></Field>
      <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {results.map((c) => (
          <button key={c.id} onClick={() => setPicked(c)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] ${picked?.id === c.id ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/[0.05]"}`}>
            <span className="truncate">{c.name}</span><span className="ml-2 shrink-0 text-[12px] text-white/40">{c.username ? `@${c.username}` : c.phone ? `+${c.phone}` : ""}</span>
          </button>
        ))}
        {results.length === 0 && <div className="py-4 text-center text-[12.5px] text-white/40">No contacts found.</div>}
      </div>
    </Modal>
  );
}
