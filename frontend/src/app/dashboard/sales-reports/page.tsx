"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Alert, Card, Page, PageHeader, Select, Spinner, Stat } from "@/components/ui/kit";
import { BarChart, Funnel } from "@/components/ui/charts";
import { errorMessage, pipeline, type PipelineReport } from "@/lib/api";
import { fmtMoney } from "@/lib/money";

export default function SalesReportsPage() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState<PipelineReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setR(null);
    pipeline.report(days).then((x) => live && setR(x)).catch((e) => live && setErr(errorMessage(e, "Couldn't load the sales report.")));
    return () => { live = false; };
  }, [days]);

  return (
    <Page>
      <PageHeader icon={<TrendingUp size={20} />} title="Sales reports" subtitle="Revenue won, how well you convert, and where deals get stuck."
        actions={<Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="!w-40" aria-label="Date range"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option></Select>} />
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      {!r ? <Spinner /> : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Revenue won" value={fmtMoney(r.won.value, "INR", { compact: true })} sub={`${r.won.count} deal${r.won.count === 1 ? "" : "s"} won`} tone={r.won.count ? "green" : undefined} />
            <Stat label="Win rate" value={r.win_rate === null ? "—" : `${r.win_rate}%`} sub={`${r.won.count} won · ${r.lost.count} lost`} />
            <Stat label="Average deal size" value={r.won.count ? fmtMoney(r.won.avg_value, "INR", { compact: true }) : "—"} sub={r.avg_cycle_days === null ? "No closed deals yet" : `${r.avg_cycle_days} days to close`} />
            <Stat label="Open pipeline" value={fmtMoney(r.open.value, "INR", { compact: true })} sub={`${r.open.count} open deal${r.open.count === 1 ? "" : "s"}`} />
            <Stat label="Weighted forecast" value={fmtMoney(r.open.weighted, "INR", { compact: true })} sub="Value × stage win probability" />
            <Stat label="New deals" value={r.created} sub={`in the last ${r.days} days`} />
          </div>

          <Card className="p-5">
            <h3 className="mb-4 text-[14.5px] font-semibold text-white">Revenue won per day (₹)</h3>
            <BarChart height={170} data={r.series.map((d) => ({ date: d.date, revenue: Math.round(d.won_value / 100) }))} series={[{ key: "revenue", label: "Won (₹)", color: "var(--brand)" }]} />
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-[14.5px] font-semibold text-white">Deals by stage <span className="font-normal text-white/40">· created in this period</span></h3>
              {r.funnel.every((f) => f.count === 0) ? <p className="text-[13px] text-white/40">No deals were created in this period.</p> : <Funnel steps={r.funnel.map((f) => ({ label: f.stage, value: f.count, color: f.color }))} />}
            </Card>
            <Card className="p-5">
              <h3 className="mb-4 text-[14.5px] font-semibold text-white">Team leaderboard</h3>
              {r.by_owner.length === 0 ? <p className="text-[13px] text-white/40">Deals you win will be ranked by owner here.</p> : (
                <ol className="space-y-2">
                  {r.by_owner.map((o, i) => (
                    <li key={o.user_id ?? "none"} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[13px]">
                      <span className="flex items-center gap-2 text-white/85"><span className="w-4 text-white/35">{i + 1}</span>{o.name}</span>
                      <span className="text-white/50"><b className="text-white">{fmtMoney(o.won_value, "INR", { compact: true })}</b> · {o.won_count} won</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-[14.5px] font-semibold text-white">Why deals are lost</h3>
              {r.lost_reasons.length === 0 ? <p className="text-[13px] text-white/40">No lost deals in this period.</p> : <Funnel steps={r.lost_reasons.map((l) => ({ label: l.reason, value: l.count, color: "#ef4444" }))} />}
            </Card>
            <Card className="p-5">
              <h3 className="mb-4 text-[14.5px] font-semibold text-white">Where won deals come from</h3>
              {r.won_sources.length === 0 ? <p className="text-[13px] text-white/40">No won deals in this period.</p> : <Funnel steps={r.won_sources.map((s) => ({ label: s.source[0].toUpperCase() + s.source.slice(1), value: s.count }))} />}
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
