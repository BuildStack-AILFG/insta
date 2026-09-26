"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Field, Input, Modal, Select, Toggle, useUi } from "@/components/ui/kit";
import { errorMessage, getSettings, patchSettings, pipeline, type PipelineStage } from "@/lib/api";
import { fromMinor, toMinor } from "@/lib/money";

const COLORS = ["#38bdf8", "#a78bfa", "#fbbf24", "#fb923c", "#f472b6", "#2dd4bf", "#22c55e", "#ef4444", "#64748b"];
const KIND_LABEL = { open: "In progress", won: "Won", lost: "Lost" } as const;

type Auto = { auto_create: boolean; default_value: number; currency: string };

/** Edit the pipeline: rename / recolour / reorder / add / remove stages, and choose whether new Instagram contacts become deals. */
export default function StageManager({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { toast, confirm } = useUi();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [auto, setAuto] = useState<Auto>({ auto_create: false, default_value: 0, currency: "INR" });
  const [autoValue, setAutoValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const load = () => {
    pipeline.stages().then(setStages).catch((e) => setError(errorMessage(e)));
    getSettings().then((r) => {
      const p = (r.settings.pipeline ?? {}) as Partial<Auto>;
      const a = { auto_create: !!p.auto_create, default_value: Number(p.default_value ?? 0), currency: p.currency ?? "INR" };
      setAuto(a);
      setAutoValue(a.default_value ? fromMinor(a.default_value) : "");
    }).catch(() => {});
  };
  useEffect(() => { if (open) { setError(null); load(); } }, [open]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); load(); onChanged(); } catch (e) { setError(errorMessage(e)); }
  };

  const patch = (s: PipelineStage, b: Partial<Pick<PipelineStage, "name" | "color" | "kind" | "probability">>) => run(() => pipeline.updateStage(s.id, b));
  const move = (i: number, dir: -1 | 1) => {
    const ids = stages.map((s) => s.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    return run(() => pipeline.reorderStages(ids));
  };
  const remove = async (s: PipelineStage) => {
    const others = stages.filter((x) => x.id !== s.id);
    const target = others.find((x) => x.kind === s.kind) ?? others.find((x) => x.kind === "open") ?? others[0];
    if (!(await confirm({ title: `Delete "${s.name}"?`, body: `Any deals in this stage move to "${target?.name}".`, confirmLabel: "Delete stage", danger: true }))) return;
    await run(() => pipeline.deleteStage(s.id, target?.id));
  };
  const add = () => run(async () => { await pipeline.addStage({ name: newName.trim(), color: COLORS[stages.length % COLORS.length], probability: 50 }); setNewName(""); });

  const saveAuto = async (next: Auto) => {
    setAuto(next);
    try { await patchSettings({ pipeline: next }); toast("Saved"); } catch (e) { setError(errorMessage(e)); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Pipeline stages" width={720} footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-5">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        <p className="text-[13px] text-white/55">Stages are the steps a deal moves through. Win probability drives your weighted forecast — set it to how likely a deal in that stage is to close.</p>
        <div className="space-y-2">
          {stages.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
              <div className="flex flex-col">
                <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="text-white/40 hover:text-white disabled:opacity-20"><ArrowUp size={14} /></button>
                <button aria-label="Move down" disabled={i === stages.length - 1} onClick={() => move(i, 1)} className="text-white/40 hover:text-white disabled:opacity-20"><ArrowDown size={14} /></button>
              </div>
              <input type="color" aria-label={`${s.name} colour`} value={s.color.length === 7 ? s.color : "#64748b"} onChange={(e) => void patch(s, { color: e.target.value })} className="h-8 w-8 cursor-pointer rounded border border-white/10 bg-transparent p-0.5" />
              <Input key={`n-${s.id}-${s.name}`} defaultValue={s.name} maxLength={80} aria-label="Stage name" className="!w-44 flex-1" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) void patch(s, { name: v }); }} />
              <Select value={s.kind} aria-label="Stage type" className="!w-32" onChange={(e) => void patch(s, { kind: e.target.value as PipelineStage["kind"] })}>
                {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </Select>
              {s.kind === "open" ? (
                <label className="flex items-center gap-1.5 text-[12px] text-white/50">Win %
                  <Input key={`p-${s.id}-${s.probability}`} type="number" min={0} max={100} defaultValue={s.probability} aria-label="Win probability" className="!w-16" onBlur={(e) => { const v = Math.max(0, Math.min(100, Number(e.target.value) || 0)); if (v !== s.probability) void patch(s, { probability: v }); }} />
                </label>
              ) : <Badge tone={s.kind === "won" ? "green" : "red"} className="w-16 justify-center">{s.kind === "won" ? "100%" : "0%"}</Badge>}
              <button aria-label={`Delete ${s.name}`} onClick={() => void remove(s)} className="ml-auto rounded-md p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newName.trim() && void add()} placeholder="New stage, e.g. Negotiation" maxLength={80} />
          <Button variant="soft" disabled={!newName.trim()} onClick={() => void add()}><Plus size={14} /> Add stage</Button>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <Toggle checked={auto.auto_create} onChange={(v) => void saveAuto({ ...auto, auto_create: v })} label="Create a deal for every new Instagram contact" />
          <p className="mt-1.5 text-[12.5px] text-white/45">When someone messages you for the first time, a deal appears in your first stage so no lead gets lost.</p>
          {auto.auto_create && (
            <Field label="Default deal value (₹, optional)" className="mt-3 max-w-[220px]">
              <Input inputMode="decimal" value={autoValue} onChange={(e) => setAutoValue(e.target.value)} placeholder="0"
                onBlur={() => { const m = autoValue.trim() ? toMinor(autoValue) : 0; if (m === null) return setError("Enter the default value as a number."); if (m !== auto.default_value) void saveAuto({ ...auto, default_value: m }); }} />
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}
