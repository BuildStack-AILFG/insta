"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, Spinner, Toggle, useUi } from "@/components/ui/kit";
import { errorMessage, getSettings, patchSettings, team, type Member } from "@/lib/api";

const MODES = [
  { id: "none", title: "Manual", desc: "New conversations stay unassigned until someone picks them up." },
  { id: "round_robin", title: "Round robin", desc: "Each new conversation goes to the next teammate in turn — fair and predictable." },
  { id: "least_busy", title: "Least busy", desc: "New conversations go to whoever has the fewest open chats right now." },
] as const;

export default function AssignmentRules() {
  const { toast } = useUi();
  const [mode, setMode] = useState<string>("none");
  const [exclude, setExclude] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSettings(), team.members()]).then(([s, m]) => {
      const a = (s.settings.assignment as { mode?: string; exclude?: string[] } | undefined) ?? {};
      setMode(a.mode ?? "none"); setExclude(a.exclude ?? []); setMembers(m);
    }).catch((e) => setErr(errorMessage(e)));
  }, []);
  if (!members) return err ? <Alert>{err}</Alert> : <Spinner />;
  const eligible = members.filter((m) => m.role !== "viewer");

  return (
    <div className="space-y-4">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <div className="grid gap-3 md:grid-cols-3">{MODES.map((m) => (
        <button key={m.id} onClick={() => setMode(m.id)} className={`rounded-2xl border p-4 text-left transition ${mode === m.id ? "border-brand bg-brand/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
          <div className="text-[14px] font-semibold text-white">{m.title}</div><p className="mt-1 text-[12.5px] text-white/50">{m.desc}</p></button>))}</div>
      {mode !== "none" && (
        <Card className="p-5"><div className="mb-3 text-[14px] font-semibold text-white">Who can receive new chats</div><p className="mb-3 text-[12.5px] text-white/50">Owners, admins and agents take part. Turn someone off to skip them (holiday, or a manager who only supervises).</p>
          <div className="space-y-2">{eligible.map((m) => (
            <label key={m.user_id} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-4 py-2.5"><span className="text-[13.5px] text-white/85">{m.full_name || m.email}<span className="ml-2 text-[11.5px] text-white/35">{m.role}{m.is_you && " · you"}</span></span>
              <Toggle checked={!exclude.includes(m.user_id)} onChange={(v) => setExclude(v ? exclude.filter((x) => x !== m.user_id) : [...exclude, m.user_id])} label={`${m.email} receives chats`} /></label>))}</div></Card>
      )}
      <div className="flex justify-end"><Button loading={busy} onClick={async () => { setBusy(true); setErr(null); try { await patchSettings({ assignment: { mode, exclude } }); toast("Assignment rules saved"); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } }}>Save rules</Button></div>
    </div>
  );
}
