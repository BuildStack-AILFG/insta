"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { BarChart, Funnel } from "@/components/ui/charts";
import { Alert, Card, EmptyState, Select, Spinner } from "@/components/ui/kit";
import { errorMessage, shop as api, type ShopReports as Reports } from "@/lib/api";
import { fmtMoney } from "@/lib/money";

const SOURCES = { store: "Store link", comment: "Comment → checkout", chat: "Ordered in chat" } as const;

/** Where the money comes from: per day, per channel, and per comment automation (= per post / reel). */
export default function ShopReports() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Reports | null>(null);
  const [asOf, setAsOf] = useState(0); // when the report was loaded: the chart's last day
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.reports(days).then((r) => { setAsOf(Date.now()); setData(r); }, (e) => setErr(errorMessage(e))); }, [days]);

  const series = useMemo(() => {
    if (!data) return [];
    const byDay = new Map(data.series.map((d) => [d.date, d]));
    const out = [];
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(asOf - i * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      out.push({ date: d, revenue: Math.round((byDay.get(d)?.revenue ?? 0) / 100), orders: byDay.get(d)?.orders ?? 0 });
    }
    return out;
  }, [data, asOf]);

  if (err) return <Alert>{err}</Alert>;
  if (!data) return <Spinner />;
  const f = data.funnel;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={days} onChange={(e) => { setData(null); setDays(Number(e.target.value)); }} className="!w-40">
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </Select>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="mb-3 text-[14px] font-semibold text-white">Sales per day</div>
          <BarChart data={series} series={[{ key: "revenue", label: "Sales (₹)", color: "var(--brand)" }, { key: "orders", label: "Orders", color: "#60a5fa" }]} />
        </Card>
        <Card className="p-5">
          <div className="mb-3 text-[14px] font-semibold text-white">Comment → sale funnel <span className="font-normal text-white/40">(all time)</span></div>
          {f.comments ? (
            <Funnel steps={[{ label: "Comments", value: f.comments }, { label: "DMs sent", value: f.dms }, { label: "Tapped Buy", value: f.buy_taps }, { label: "Ordered", value: f.orders, color: "#34d399" }]} />
          ) : <p className="text-[12.5px] text-white/45">Link a product to a Comment → DM automation to see how comments turn into orders.</p>}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {(Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map((s) => (
              <div key={s} className="rounded-lg bg-white/[0.04] py-2">
                <div className="text-[14px] font-bold text-white">{fmtMoney(data.by_source[s]?.revenue ?? 0, "INR", { compact: true })}</div>
                <div className="text-[10.5px] text-white/40">{SOURCES[s]}</div>
              </div>
            ))}
          </div>
          {data.returned > 0 && <p className="mt-3 text-[12px] text-amber-200/80">{data.returned} order{data.returned === 1 ? "" : "s"} returned (RTO) in this period.</p>}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 text-[14px] font-semibold text-white">Sales by post / reel <span className="font-normal text-white/40">(per Comment → DM automation, all time)</span></div>
        {data.by_automation.length === 0 ? (
          <EmptyState icon={<ImageIcon size={20} />} title="No selling automations yet" body="In Comment → DM, pick a product under “Sell a product” — every sale from that post shows up here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-[11.5px] uppercase tracking-wide text-white/40">
                <tr><th className="py-2 font-medium">Automation</th><th className="font-medium">Comments</th><th className="font-medium">Tapped Buy</th><th className="font-medium">Orders</th><th className="font-medium">Conversion</th><th className="text-right font-medium">Sales</th></tr>
              </thead>
              <tbody>{data.by_automation.map((a) => (
                <tr key={a.id} className="border-t border-white/[0.06]">
                  <td className="py-2.5"><div className="flex items-center gap-2.5">
                    {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.06] text-white/30"><ImageIcon size={14} /></div>}
                    <div><div className="font-medium text-white">{a.name}</div><div className="text-[11.5px] text-white/40">{a.posts}</div></div>
                  </div></td>
                  <td className="text-white/70">{a.comments.toLocaleString()}</td>
                  <td className="text-white/70">{a.buy_taps.toLocaleString()}</td>
                  <td className="text-white/70">{a.orders.toLocaleString()}</td>
                  <td className="text-white/70">{a.conversion}%</td>
                  <td className="text-right font-semibold text-white">{fmtMoney(a.revenue)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {data.by_product.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 text-[14px] font-semibold text-white">Best sellers</div>
          <div className="space-y-2">{data.by_product.map((p) => (
            <div key={p.id} className="flex items-center gap-3 text-[13px]">
              {p.image_url ? <img src={p.image_url} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div className="h-9 w-9 rounded-md bg-white/[0.06]" />}
              <span className="min-w-0 flex-1 truncate text-white">{p.name}</span>
              <span className="text-white/50">{p.orders} sold</span>
              <span className="w-24 text-right font-semibold text-white">{fmtMoney(p.revenue)}</span>
            </div>
          ))}</div>
        </Card>
      )}
    </div>
  );
}
