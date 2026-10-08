"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Plus, Trash2, Workflow } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Page, PageHeader, Spinner, statusTone, timeAgo, useUi } from "@/components/ui/kit";
import { errorMessage, flows as api, type FlowGraph, type FlowSummary } from "@/lib/api";
import { PRESETS, TRIGGERS } from "@/components/flow/model";

export default function FlowsPage() {
  const router = useRouter();
  const { toast, confirm } = useUi();
  const [list, setList] = useState<FlowSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("blank");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setList(await api.list()); } catch (e) { setError(errorMessage(e, "Couldn't load flows.")); } }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const p = PRESETS.find((x) => x.id === preset)!;
      const f = await api.create({ name: name.trim(), trigger_type: p.trigger, graph: p.graph() as FlowGraph });
      router.push(`/dashboard/flow-builder/${f.id}`);
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };

  return (
    <Page>
      <PageHeader icon={<Workflow size={20} />} title="Flow builder" subtitle="Design automated conversations: ask questions, branch on answers, send link buttons, wait, call your systems, or hand over to a human."
        actions={<Button onClick={() => setShow(true)}><Plus size={15} /> New flow</Button>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      {!list ? <Spinner /> : list.length === 0 ? <EmptyState icon={<Workflow size={22} />} title="No flows yet" body="Start from a ready-made flow or a blank canvas." action={<Button onClick={() => setShow(true)}><Plus size={15} /> Create your first flow</Button>} /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="border-b border-white/10 text-[11.5px] uppercase tracking-wide text-white/40"><tr><th className="px-5 py-3">Flow</th><th className="px-2 py-3">Trigger</th><th className="px-2 py-3">Status</th><th className="hidden px-2 py-3 md:table-cell">Steps</th><th className="hidden px-2 py-3 md:table-cell">Runs</th><th className="px-2 py-3">Updated</th><th className="px-5 py-3" /></tr></thead>
            <tbody>{list.map((f) => (
              <tr key={f.id} className="border-b border-white/5 hover:bg-white/[0.04]">
                <td className="px-5 py-3"><Link href={`/dashboard/flow-builder/${f.id}`} className="font-medium text-white hover:underline">{f.name}</Link></td>
                <td className="px-2 py-3 text-white/60">{TRIGGERS.find((t) => t.id === f.trigger_type)?.label ?? f.trigger_type}</td>
                <td className="px-2 py-3"><Badge tone={statusTone(f.status)}>{f.status}</Badge>{f.has_unpublished_changes && <Badge tone="yellow" className="ml-1">unpublished edits</Badge>}</td>
                <td className="hidden px-2 py-3 text-white/60 md:table-cell">{f.node_count}</td><td className="hidden px-2 py-3 text-white/60 md:table-cell">{f.conversations_sent.toLocaleString()}</td>
                <td className="px-2 py-3 text-white/45">{timeAgo(f.updated_at)}</td>
                <td className="px-5 py-3"><div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" aria-label="Duplicate" onClick={async () => { try { await api.duplicate(f.id); toast("Flow duplicated"); await load(); } catch (e) { toast(errorMessage(e), "error"); } }}><Copy size={13} /></Button>
                  <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete “${f.name}”?`, body: "Running conversations in this flow are stopped.", confirmLabel: "Delete", danger: true })) { try { await api.remove(f.id); await load(); toast("Flow deleted"); } catch (e) { toast(errorMessage(e), "error"); } } }}><Trash2 size={13} /></Button></div></td>
              </tr>))}</tbody>
          </table></div>
        </Card>
      )}
      <Modal open={show} onClose={() => setShow(false)} title="New flow" width={760} footer={<><Button variant="ghost" onClick={() => setShow(false)}>Cancel</Button><Button loading={busy} disabled={!name.trim()} onClick={create}>Create & open</Button></>}>
        <Field label="Flow name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lead qualification" autoFocus /></Field>
        <div className="mb-2 mt-4 text-[12.5px] font-medium text-white/70">Start from a template</div>
        <div className="grid gap-2 sm:grid-cols-2">{PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => { setPreset(p.id); if (!name.trim() && p.id !== "blank") setName(p.label); }}
            className={`rounded-xl border p-3 text-left transition ${preset === p.id ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-[13.5px] font-semibold text-white">{p.label}</span><span className="shrink-0 text-[11px] text-white/40">{TRIGGERS.find((t) => t.id === p.trigger)?.label}</span></div>
            <p className="mt-1 text-[12px] leading-snug text-white/50">{p.description}</p>
            <p className="mt-1.5 text-[11px] text-white/35">{p.graph().nodes.length} steps</p>
          </button>
        ))}</div>
      </Modal>
    </Page>
  );
}
