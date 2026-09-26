"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/kit";
import { pipeline, team, type Deal, type Member, type PipelineStage } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import DealModal from "./DealModal";

/** Deals for one contact, shown in the inbox side panel: see where they are in the pipeline and add or open a deal without leaving the chat. */
export default function ContactDeals({ contact, canWrite }: { contact: { id: string; name: string }; canWrite: boolean }) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState<{ id: string | null } | null>(null);

  const load = useCallback(() => { pipeline.deals({ contact_id: contact.id, limit: 20 }).then((r) => setDeals(r.items)).catch(() => setDeals([])); }, [contact.id]);
  useEffect(() => { setDeals(null); load(); }, [load]);
  useEffect(() => { pipeline.stages().then(setStages).catch(() => {}); }, []);

  const launch = async (id: string | null) => {
    const [s, m] = await Promise.all([pipeline.stages().catch(() => []), team.members().catch(() => [])]);
    setStages(s);
    setMembers(m);
    setOpen({ id });
  };
  const stageName = (id: string) => stages.find((s) => s.id === id)?.name;

  return (
    <>
      {deals === null ? <div className="text-[12px] text-white/30">Loading…</div> : deals.length === 0 ? <div className="text-[12px] text-white/30">No deals yet</div> : (
        <ul className="space-y-1.5">
          {deals.map((d) => (
            <li key={d.id}>
              <button onClick={() => void launch(d.id)} className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/[0.05] px-2.5 py-2 text-left text-[12.5px] hover:bg-white/[0.09]">
                <span className="min-w-0"><span className="block truncate text-white/90">{d.title}</span><span className="text-white/40">{d.value ? fmtMoney(d.value, d.currency) : "No value"}</span></span>
                <Badge tone={d.status === "won" ? "green" : d.status === "lost" ? "red" : "blue"}>{d.status === "open" ? (stageName(d.stage_id) ?? "Open") : d.status}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      {canWrite && <button onClick={() => void launch(null)} className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-sky-300 hover:underline"><Plus size={13} /> Add deal</button>}
      {open && <DealModal key={open.id ?? "new"} dealId={open.id} stages={stages} members={members} defaultContact={contact} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}
