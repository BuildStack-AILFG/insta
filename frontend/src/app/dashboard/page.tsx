"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Bot, CheckCircle2, Circle, Inbox, MessageCircleReply, MessagesSquare, Sparkles, Workflow } from "lucide-react";
import { InstagramIcon } from "@/components/icons/BrandIcons";
import { ACCENT, accentTint, Card, cx, fmtDuration, Page, Spinner, Stat } from "@/components/ui/kit";
import { BarChart } from "@/components/ui/charts";
import { useWorkspace } from "@/components/dashboard/WorkspaceContext";
import { ai, analytics, commentAutomations, flows, inbox, instagram, type Analytics } from "@/lib/api";

type Setup = { account: boolean; username: string | null; automation: boolean; iceBreakers: boolean; flow: boolean; ai: boolean; conversation: boolean; unread: number };

export default function DashboardHome() {
  const me = useWorkspace();
  const [s, setS] = useState<Setup | null>(null);
  const [a, setA] = useState<Analytics | null>(null);

  useEffect(() => {
    const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);
    Promise.all([
      safe(instagram.list(), []), safe(commentAutomations.list(), []), safe(flows.list(), []), safe(ai.config(), null), safe(inbox.summary(), null),
    ]).then(([acc, ca, f, aiCfg, sum]) => {
      const live = acc.filter((x) => x.status !== "disconnected");
      setS({
        account: live.length > 0, username: live[0]?.username ?? null, automation: ca.some((x) => x.status === "active"),
        iceBreakers: live.some((x) => x.ice_breakers.length > 0), flow: f.some((x) => x.status === "published"), ai: !!aiCfg?.enabled,
        conversation: !!sum && sum.open + sum.resolved > 0, unread: sum?.unread_conversations ?? 0,
      });
    });
    analytics.overview(7).then(setA).catch(() => {});
  }, []);

  const name = me.full_name?.trim().split(" ")[0] || me.workspace.name;
  const steps = s ? [
    { done: s.account, title: "Connect your Instagram account", body: "Link your Business or Creator account so comments and DMs flow in.", href: "/dashboard/instagram", icon: InstagramIcon },
    { done: s.automation, title: "Create a comment → DM automation", body: "Reply to comments and DM people who comment a keyword on your posts.", href: "/dashboard/comment-automations?new=1", icon: MessageCircleReply },
    { done: s.iceBreakers, title: "Add ice breakers", body: "Tappable questions people see when they open a chat with you.", href: "/dashboard/instagram", icon: Sparkles },
    { done: s.flow, title: "Publish a DM flow", body: "Qualify leads, collect emails and answer questions automatically.", href: "/dashboard/flow-builder", icon: Workflow },
    { done: s.ai, title: "Turn on the AI agent", body: "Let AI answer DMs from your knowledge base.", href: "/dashboard/ai-agent", icon: Bot },
    { done: s.conversation, title: "Get your first DM", body: "Send your account a message from another profile to see it arrive in the inbox.", href: "/dashboard/inbox", icon: MessagesSquare },
  ] : [];
  const doneCount = steps.filter((x) => x.done).length;
  const next = steps.find((x) => !x.done);
  const week = (k: "inbound" | "outbound") => (a?.messages ?? []).reduce((t, d) => t + d[k], 0);

  return (
    <Page>
      <h1 className="text-[22px] font-bold text-white">Hello 👋 Welcome, {name}!</h1>
      <p className="mt-1 text-[14px] text-white/50">{s && doneCount === steps.length ? "You're all set up. Here's how things are going." : s?.username ? `Let's put @${s.username} on autopilot.` : "Let's get your Instagram on autopilot."}</p>

      {s?.unread ? (
        <Link href="/dashboard/inbox" className="mt-5 flex items-center justify-between rounded-2xl border border-sky-500/30 bg-sky-500/10 px-5 py-4 hover:bg-sky-500/15">
          <span className="flex items-center gap-3 text-[14px] font-medium text-white"><Inbox size={18} className="text-sky-300" /> {s.unread} conversation{s.unread === 1 ? "" : "s"} waiting for a reply</span><ArrowRight size={16} className="text-sky-300" /></Link>
      ) : null}

      {!s ? <Spinner /> : doneCount < steps.length && (
        <div className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 p-6" style={{ backgroundImage: `linear-gradient(90deg, var(--background), ${accentTint(20)})` }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-[16px] font-bold text-white">Setup progress · {doneCount} of {steps.length}</p><p className="mt-1 text-[13px] text-white/50">{next ? `Next: ${next.title}` : ""}</p></div>
            {next && <Link href={next.href} className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white btn-accent" style={{ background: ACCENT }}>{next.title} <ArrowRight size={14} /></Link>}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all" style={{ width: `${(doneCount / steps.length) * 100}%`, background: ACCENT }} /></div>
        </div>
      )}

      {s && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {steps.map((st) => (
            <Link key={st.title} href={st.href} className={cx("flex items-start gap-3 rounded-2xl border p-4 transition hover:bg-white/[0.05]", st.done ? "border-white/5 bg-white/[0.015] opacity-70" : "border-white/10 bg-white/[0.03]")}>
              {st.done ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" style={{ color: ACCENT }} /> : <Circle size={20} className="mt-0.5 shrink-0 text-white/25" />}
              <div className="min-w-0 flex-1"><div className={cx("text-[14px] font-semibold", st.done ? "text-white/60 line-through decoration-white/20" : "text-white")}>{st.title}</div><div className="text-[12.5px] text-white/45">{st.body}</div></div>
              <st.icon size={18} className="mt-0.5 shrink-0 text-white/30" />
            </Link>))}
        </div>
      )}

      {a && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-semibold text-white">Last 7 days</h2><Link href="/dashboard/conversation-analytics" className="flex items-center gap-1 text-[12.5px] text-sky-300 hover:underline"><BarChart3 size={13} /> Full analytics</Link></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="DMs received" value={week("inbound").toLocaleString()} /><Stat label="DMs sent" value={week("outbound").toLocaleString()} sub={`${a.delivery.read_pct}% seen`} />
            <Stat label="Comments automated" value={a.comments.matched.toLocaleString()} sub={`${a.comments.dms_sent} DMs · ${a.comments.received} comments`} /><Stat label="Avg. first response" value={fmtDuration(a.first_response.avg_seconds)} />
          </div>
          <Card className="mt-4 p-5"><BarChart height={150} data={a.messages} series={[{ key: "inbound", label: "Received", color: "#38bdf8" }, { key: "outbound", label: "Sent", color: "var(--brand)" }]} /></Card>
        </div>
      )}
    </Page>
  );
}
