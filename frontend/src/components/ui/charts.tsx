"use client";

import { useState } from "react";

type Series = { key: string; label: string; color: string };

/** Grouped/stacked-free bar chart with a hover tooltip. Pure SVG, no dependencies. */
export function BarChart({ data, series, height = 180 }: { data: ({ date: string } & Record<string, number | string>)[]; series: Series[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const w = 100 / Math.max(data.length, 1);
  const bw = (w * 0.8) / series.length;
  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString([], { day: "numeric", month: "short" });
  const empty = data.every((d) => series.every((s) => !Number(d[s.key])));

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-white/55">{series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}</div>
      <div className="relative" style={{ height }}>
        {empty && <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-white/35">No activity in this period</div>}
        <svg viewBox={`0 0 100 ${height / 4}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Bar chart">
          {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2="100" y1={(height / 4) * (1 - f)} y2={(height / 4) * (1 - f)} stroke="color-mix(in srgb, var(--foreground) 8%, transparent)" strokeWidth="0.3" />)}
          {data.map((d, i) => (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * w} y={0} width={w} height={height / 4} fill={hover === i ? "color-mix(in srgb, var(--foreground) 5%, transparent)" : "transparent"} />
              {series.map((s, si) => { const v = Number(d[s.key]) || 0; const h = (v / max) * (height / 4 - 2); return <rect key={s.key} x={i * w + w * 0.1 + si * bw} y={height / 4 - h} width={Math.max(bw - 0.15, 0.2)} height={h} rx={0.3} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.5} />; })}
            </g>
          ))}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-white/10 bg-surface/95 px-3 py-2 text-[12px] shadow-xl" style={{ left: `${Math.min(Math.max((hover + 0.5) * w, 12), 80)}%`, transform: "translateX(-50%)" }}>
            <div className="mb-1 font-medium text-white">{fmtDate(data[hover].date)}</div>{series.map((s) => <div key={s.key} className="flex items-center gap-2 text-white/70"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}: <b className="text-white">{Number(data[hover][s.key]) || 0}</b></div>)}
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-white/30"><span>{data[0] && fmtDate(data[0].date)}</span><span>{data.at(-1) && fmtDate(data.at(-1)!.date)}</span></div>
    </div>
  );
}

/** Horizontal funnel: each row is a bar relative to the first row. */
export function Funnel({ steps }: { steps: { label: string; value: number; color?: string }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className="space-y-3">{steps.map((s) => (
      <div key={s.label}><div className="mb-1 flex justify-between text-[12.5px]"><span className="text-white/70">{s.label}</span><span className="text-white/50"><b className="text-white">{s.value.toLocaleString()}</b> · {Math.round((s.value / top) * 100)}%</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all" style={{ width: `${(s.value / top) * 100}%`, background: s.color ?? "var(--brand)" }} /></div></div>))}
    </div>
  );
}
