"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { Alert, Button, Card, EmptyState, Page, PageHeader, Select, Spinner, Stat, Tabs } from "@/components/ui/kit";
import { BarChart } from "@/components/ui/charts";
import { errorMessage, insightsApi, instagram, type AccountInsights, type IgAccount, type MediaInsight } from "@/lib/api";

const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString();
type Breakdown = "country" | "city" | "age" | "gender";

export default function InsightsPage() {
  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AccountInsights | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    instagram.list().then((a) => { const live = a.filter((x) => x.status !== "disconnected"); setAccounts(live); if (live[0]) setAccountId(live[0].id); }).catch(() => setAccounts([]));
  }, []);
  useEffect(() => {
    if (!accountId) return;
    setData(null); setErr(null);
    insightsApi.account(accountId, days).then(setData).catch((e) => setErr(errorMessage(e)));
  }, [accountId, days]);

  if (accounts && accounts.length === 0) {
    return <Page><EmptyState icon={<LineChart size={22} />} title="Connect Instagram first" body="Insights come straight from your Instagram account." action={<Link href="/dashboard/instagram"><Button>Connect Instagram</Button></Link>} /></Page>;
  }
  const t = data?.totals ?? {};
  return (
    <Page wide>
      <PageHeader icon={<LineChart size={20} />} title="Instagram insights" subtitle="Reach, views, engagement and audience for your account and recent posts. Instagram updates most numbers every few hours."
        actions={<div className="flex gap-2">
          {accounts && accounts.length > 1 && <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="!w-44" aria-label="Account">{accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}</Select>}
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="!w-36" aria-label="Date range"><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option></Select>
        </div>} />
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      {!data ? (err ? null : <Spinner />) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Views" value={fmt(t.views)} sub="Times your content was seen" />
            <Stat label="Accounts reached" value={fmt(t.reach)} sub={`${fmt(t.accounts_engaged)} engaged`} />
            <Stat label="Interactions" value={fmt(t.total_interactions)} sub={`${fmt(t.likes)} likes · ${fmt(t.comments)} comments`} />
            <Stat label="Followers" value={fmt(data.followers_count)} sub={`+${fmt(data.follows)} / −${fmt(data.unfollows)} in ${data.days} days`} tone={data.follows >= data.unfollows ? "green" : "red"} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Shares" value={fmt(t.shares)} /><Stat label="Saves" value={fmt(t.saves)} /><Stat label="Profile link taps" value={fmt(t.profile_links_taps)} />
          </div>
          {data.reach_series.length > 0 && <Card className="p-5"><h3 className="mb-4 text-[14.5px] font-semibold text-white">Reach per day</h3><BarChart height={160} data={data.reach_series} series={[{ key: "reach", label: "Reach", color: "var(--brand)" }]} /></Card>}
          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <Audience accountId={accountId} />
            <RecentPosts accountId={accountId} />
          </div>
        </div>
      )}
    </Page>
  );
}

function Audience({ accountId }: { accountId: string }) {
  const [tab, setTab] = useState<Breakdown>("country");
  const [items, setItems] = useState<{ label: string; value: number }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setItems(null); setErr(null);
    insightsApi.demographics(accountId, tab).then((r) => setItems(r.items)).catch((e) => setErr(errorMessage(e)));
  }, [accountId, tab]);
  const max = Math.max(1, ...(items ?? []).map((i) => i.value));
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-[14.5px] font-semibold text-white">Your followers</h3>
      <Tabs tabs={[{ id: "country", label: "Country" }, { id: "city", label: "City" }, { id: "age", label: "Age" }, { id: "gender", label: "Gender" }]} value={tab} onChange={setTab} />
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : !items ? <Spinner /> : items.length === 0 ? (
        <p className="text-[12.5px] text-white/45">Instagram shares audience data once an account has at least 100 followers.</p>
      ) : (
        <div className="space-y-2">{items.map((i) => (
          <div key={i.label}>
            <div className="mb-0.5 flex justify-between text-[12.5px]"><span className="text-white/75">{i.label}</span><span className="text-white/45">{i.value.toLocaleString()}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand" style={{ width: `${(100 * i.value) / max}%` }} /></div>
          </div>
        ))}</div>
      )}
    </Card>
  );
}

function RecentPosts({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<MediaInsight[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setItems(null); setErr(null);
    insightsApi.media(accountId).then((r) => setItems(r.items)).catch((e) => setErr(errorMessage(e)));
  }, [accountId]);
  return (
    <Card className="overflow-hidden">
      <h3 className="px-5 pt-5 text-[14.5px] font-semibold text-white">Recent posts</h3>
      {err ? <p className="p-5 text-[12.5px] text-red-300">{err}</p> : !items ? <Spinner /> : items.length === 0 ? <p className="p-5 text-[12.5px] text-white/45">No posts yet.</p> : (
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[520px] text-left text-[12.5px]">
            <thead className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40"><tr><th className="px-5 py-2">Post</th><th className="px-2 py-2 text-right">Reach</th><th className="px-2 py-2 text-right">Views</th><th className="px-2 py-2 text-right">Likes</th><th className="px-2 py-2 text-right">Comments</th><th className="px-2 py-2 text-right">Shares</th><th className="px-5 py-2 text-right">Saves</th></tr></thead>
            <tbody>{items.map((m) => (
              <tr key={m.id} className="border-b border-white/5">
                <td className="px-5 py-2"><a href={m.permalink ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 hover:underline">
                  {m.thumbnail_url ? <img src={m.thumbnail_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" /> : <div className="h-10 w-10 shrink-0 rounded-md bg-white/10" />}
                  <span className="line-clamp-2 max-w-[220px] text-white/80">{m.caption || (m.media_product_type === "REELS" ? "Reel" : "Post")}</span></a></td>
                <td className="px-2 py-2 text-right text-white">{fmt(m.metrics.reach)}</td>
                <td className="px-2 py-2 text-right text-white/70">{fmt(m.metrics.views)}</td>
                <td className="px-2 py-2 text-right text-white/70">{fmt(m.metrics.likes ?? m.like_count)}</td>
                <td className="px-2 py-2 text-right text-white/70">{fmt(m.metrics.comments ?? m.comments_count)}</td>
                <td className="px-2 py-2 text-right text-white/70">{fmt(m.metrics.shares)}</td>
                <td className="px-5 py-2 text-right text-white/70">{fmt(m.metrics.saved)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
