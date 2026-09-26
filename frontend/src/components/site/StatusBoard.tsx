"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { API_ORIGIN } from "@/lib/api";

type Row = { name: string; detail: string; state: "checking" | "up" | "down" };

/** Live checks run from the visitor's browser against the real API health endpoint — this is not a static "all green" badge. */
export default function StatusBoard() {
  const [rows, setRows] = useState<Row[]>([
    { name: "Website", detail: "Marketing site and dashboard", state: "up" },
    { name: "API", detail: "Application servers", state: "checking" },
    { name: "Database", detail: "Primary datastore", state: "checking" },
  ]);
  const [at, setAt] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setRows((r) => r.map((x) => (x.name === "Website" ? x : { ...x, state: "checking" })));
    let api: Row["state"] = "down";
    let db: Row["state"] = "down";
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(`${API_ORIGIN}/api/health`, { cache: "no-store", signal: ctl.signal });
      clearTimeout(t);
      api = "up"; // any response means the servers are answering; the database check below is stricter
      const body = await res.json().catch(() => ({}));
      db = res.ok && body.status === "ok" ? "up" : "down";
    } catch {
      /* unreachable: both stay "down" */
    }
    setRows((r) => r.map((x) => (x.name === "API" ? { ...x, state: api } : x.name === "Database" ? { ...x, state: db } : x)));
    setAt(new Date());
  }, []);

  useEffect(() => { void check(); }, [check]);

  const allUp = rows.every((r) => r.state === "up");
  const checking = rows.some((r) => r.state === "checking");

  return (
    <div>
      <div className={`flex items-center gap-3 rounded-2xl border p-6 ${checking ? "border-white/10 bg-white/[0.03]" : allUp ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`} role="status" aria-live="polite">
        {checking ? <Loader2 className="animate-spin text-white/60" /> : allUp ? <CheckCircle2 className="text-emerald-400" /> : <XCircle className="text-red-400" />}
        <div>
          <p className="text-[18px] font-semibold text-white">{checking ? "Checking systems…" : allUp ? "All systems operational" : "Some systems are having problems"}</p>
          {at && <p className="text-[12.5px] text-white/45">Checked {at.toLocaleTimeString()} from your browser</p>}
        </div>
        <button onClick={() => void check()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[13px] text-white/80 hover:bg-white/10"><RefreshCw size={13} /> Recheck</button>
      </div>
      <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-4 px-5 py-4">
            <div><p className="text-[15px] font-medium text-white">{r.name}</p><p className="text-[12.5px] text-white/45">{r.detail}</p></div>
            <span className={`flex items-center gap-1.5 text-[13.5px] font-medium ${r.state === "up" ? "text-emerald-400" : r.state === "down" ? "text-red-400" : "text-white/50"}`}>
              {r.state === "checking" ? <Loader2 size={14} className="animate-spin" /> : r.state === "up" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              {r.state === "checking" ? "Checking" : r.state === "up" ? "Operational" : "Unreachable"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
