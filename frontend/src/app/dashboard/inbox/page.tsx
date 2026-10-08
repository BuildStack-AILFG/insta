"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertTriangle, AtSign, Bot, Check, CheckCheck, ChevronLeft, Clock, ExternalLink, FileText, Heart, IndianRupee, Inbox as InboxIcon, Link2, MessageCircleReply, Paperclip, Plus, Search, Send, StickyNote, Trash2, UserRound, X, Zap } from "lucide-react";
import { ACCENT, accentTint, Alert, Badge, Button, cx, EmptyState, Field, fmtDateTime, Input, Modal, Select, Spinner, timeAgo, Toggle, useDebounced, usePoll, useUi } from "@/components/ui/kit";
import {
  contacts as contactsApi, errorMessage, getSettings, inbox, instagram, team,
  type ChatMessage, type ConversationDetail, type ConversationSummary, type Member, type SendBody,
} from "@/lib/api";
import PaymentLinkModal from "@/components/sales/PaymentLinkModal";
import ContactDeals from "@/components/sales/ContactDeals";
import { useHasFeature } from "@/components/dashboard/UpgradeGate";
import { useWorkspace } from "@/components/dashboard/WorkspaceContext";

type Filter = "open" | "mine" | "unassigned" | "resolved";

export default function InboxPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const router = useRouter();
  const params = useSearchParams();
  const { user_id } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof inbox.summary>> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(params.get("c"));
  const [members, setMembers] = useState<Member[]>([]);
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const p = filter === "resolved" ? { status: "resolved" } : filter === "mine" ? { status: "open", assigned: "me" } : filter === "unassigned" ? { status: "open", assigned: "unassigned" } : { status: "open" };
      const [l, s] = await Promise.all([inbox.list({ ...p, q: dq || undefined, limit: 60 }), inbox.summary()]);
      setList(l.items);
      setTotal(l.total);
      setSummary(s);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Couldn't load conversations."));
    }
  }, [filter, dq]);

  usePoll(loadList, 8000, [filter, dq]);
  useEffect(() => {
    team.members().then(setMembers).catch(() => {});
    instagram.list().then((a) => setHasAccount(a.some((x) => x.status !== "disconnected"))).catch(() => setHasAccount(true));
  }, []);

  const open = (id: string | null) => {
    setActiveId(id);
    router.replace(id ? `/dashboard/inbox?c=${id}` : "/dashboard/inbox", { scroll: false });
  };

  if (hasAccount === false) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-20">
        <EmptyState icon={<InboxIcon size={22} />} title="Connect Instagram to start chatting" body="Your shared team inbox shows every Instagram DM, story reply and comment-automation conversation. Connect your account first."
          action={<Link href="/dashboard/instagram"><Button>Connect Instagram</Button></Link>} />
      </div>
    );
  }

  const tabs: { id: Filter; label: string; count?: number }[] = [
    { id: "open", label: "Open", count: summary?.open }, { id: "mine", label: "Mine", count: summary?.mine },
    { id: "unassigned", label: "Unassigned", count: summary?.unassigned }, { id: "resolved", label: "Resolved" },
  ];

  return (
    <div className="flex h-full min-h-0">
      {/* conversation list */}
      <aside className={cx("flex w-full shrink-0 flex-col border-r border-white/10 md:w-[340px]", activeId && "hidden md:flex")}>
        <div className="border-b border-white/10 p-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or @username" className="pl-9" aria-label="Search conversations" />
          </div>
          <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setFilter(t.id)} className={cx("shrink-0 rounded-full px-3 py-1 text-[12.5px] transition", filter === t.id ? "text-white" : "text-white/50 hover:text-white/80")} style={filter === t.id ? { background: accentTint(20), color: "var(--foreground)" } : undefined}>
                {t.label}{t.count ? <span className="ml-1.5 text-white/40">{t.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <div className="p-3"><Alert>{error}</Alert></div>}
          {!list && !error && <Spinner />}
          {list && list.length === 0 && <div className="px-6 py-16 text-center text-[13px] text-white/40">{dq ? "No conversations match your search." : filter === "resolved" ? "No resolved conversations yet." : "No conversations here yet. DMs, story replies and comment DMs appear here instantly."}</div>}
          {list?.map((c) => (
            <button key={c.id} onClick={() => open(c.id)} className={cx("flex w-full items-start gap-3 border-b border-white/5 px-3 py-3 text-left sm:px-4 transition hover:bg-white/[0.04]", activeId === c.id && "bg-white/[0.07]")}>
              <Avatar name={c.contact.name} src={c.contact.profile_pic_url} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={cx("truncate text-[13.5px]", c.unread_count ? "font-semibold text-white" : "text-white/85")}>{c.contact.name}</span>
                  <span className="shrink-0 text-[11px] text-white/35">{timeAgo(c.last_message_at)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] text-white/45">{c.last_message_preview ?? "No messages yet"}</span>
                  {c.unread_count > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white btn-accent" style={{ background: ACCENT }}>{c.unread_count}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.inbox_status === "intervened" && <Badge tone="blue"><UserRound size={10} /> Human</Badge>}
                  {c.assigned_user && <Badge>{c.assigned_user.id === user_id ? "You" : c.assigned_user.name.split(" ")[0]}</Badge>}
                  {!c.window_open && <Badge tone="yellow"><Clock size={10} /> Window closed</Badge>}
                  {c.labels.slice(0, 2).map((l) => <Badge key={l}>{l}</Badge>)}
                </div>
              </div>
            </button>
          ))}
          {list && total > list.length && <div className="p-3 text-center text-[12px] text-white/35">Showing {list.length} of {total}. Use search to narrow down.</div>}
        </div>
      </aside>

      {activeId ? (
        <Thread key={activeId} id={activeId} members={members} userId={user_id} onBack={() => open(null)} onChanged={loadList} />
      ) : (
        <div className="hidden flex-1 items-center justify-center md:flex">
          <EmptyState icon={<InboxIcon size={22} />} title="Select a conversation" body="Pick a chat on the left to reply, add notes or assign it to a teammate." />
        </div>
      )}
    </div>
  );
}

// ---- thread -------------------------------------------------------------------------------------------------------------------------------------------

function Thread({ id, members, userId, onBack, onChanged }: { id: string; members: Member[]; userId: string; onBack: () => void; onChanged: () => void }) {
  const { toast } = useUi();
  const { role } = useWorkspace();
  const canWrite = role !== "viewer";
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [windowOpen, setWindowOpen] = useState(true);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [quick, setQuick] = useState<{ id: string; shortcut: string; text: string }[]>([]);
  const [panel, setPanel] = useState(true); // desktop side column
  const [mobilePanel, setMobilePanel] = useState(false); // slide-over below lg
  const bottomRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const loadConv = useCallback(async () => {
    try { setConv(await inbox.get(id)); } catch (e) { setErr(errorMessage(e)); }
  }, [id]);
  const loadMsgs = useCallback(async () => {
    try {
      const r = await inbox.messages(id, { limit: 100 });
      setMsgs(r.items);
      setWindowOpen(r.window_open);
    } catch { /* keep the last good list */ }
  }, [id]);

  useEffect(() => { void loadConv(); inbox.read(id).then(onChanged).catch(() => {}); getSettings().then((s) => setQuick((s.settings.quick_replies as typeof quick) ?? [])).catch(() => {}); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  usePoll(loadMsgs, 3000, [id]);
  usePoll(async () => { await loadConv(); }, 15000, [id]);

  useEffect(() => { if (stick.current) bottomRef.current?.scrollIntoView({ block: "end" }); }, [msgs]);
  // mark read whenever something new arrives while the thread is open
  const lastIn = msgs?.filter((m) => m.direction === "in").at(-1)?.id;
  useEffect(() => { if (lastIn) inbox.read(id).then(onChanged).catch(() => {}); }, [lastIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (body: Parameters<typeof inbox.send>[1]) => {
    setSending(true);
    setErr(null);
    try {
      await inbox.send(id, body);
      stick.current = true;
      await Promise.all([loadMsgs(), loadConv()]);
      onChanged();
    } catch (e) {
      setErr(errorMessage(e));
      throw e;
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    try { await send({ type: mode === "note" ? "note" : "text", text: t }); setText(""); } catch { /* shown in banner */ }
  };

  const patch = async (b: Parameters<typeof inbox.patch>[1], ok?: string) => {
    try { await inbox.patch(id, b); await loadConv(); onChanged(); if (ok) toast(ok); } catch (e) { toast(errorMessage(e), "error"); }
  };

  const shortcutMatches = useMemo(() => (text.startsWith("/") ? quick.filter((q) => q.shortcut.toLowerCase().startsWith(text.slice(1).toLowerCase())).slice(0, 5) : []), [text, quick]);

  if (!conv) return <div className="flex-1">{err ? <div className="p-6"><Alert>{err}</Alert></div> : <Spinner />}</div>;
  const c = conv.contact;
  // Outside the 24h window only a human agent may still reply (for 7 days, when the Human Agent tag is enabled on the account).
  const humanAgentOpen = !!conv.human_agent_until && new Date(conv.human_agent_until) > new Date();
  const blocked = mode === "reply" && !windowOpen && !humanAgentOpen;

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
          <button onClick={onBack} className="-ml-1 rounded-md p-1 text-white/60 hover:bg-white/10 md:hidden" aria-label="Back to conversations"><ChevronLeft size={22} /></button>
          <button onClick={() => setMobilePanel(true)} className="shrink-0 lg:pointer-events-none" aria-label="Contact details" tabIndex={-1}><Avatar name={c.name} src={c.profile_pic_url} size={36} /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-semibold text-white">{c.name}</div>
            <div className="truncate text-[12px] text-white/45">
              {c.username ? `@${c.username}` : c.phone ? `+${c.phone}` : "Instagram user"}
              {c.is_follower && <span className="ml-2 text-brand-bright">follows you</span>}
              {c.opted_out && <span className="ml-2 text-red-300">opted out</span>}
            </div>
          </div>
          {canWrite && (
            // On phones the actions drop to their own full-width row under the contact name.
            <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto sm:gap-3">
              <Select value={conv.assigned_user?.id ?? "none"} onChange={(e) => patch({ assigned_user_id: e.target.value === "none" ? null : e.target.value }, "Assignment updated")} className="min-w-0 flex-1 !py-1.5 text-[12.5px] sm:!w-40 sm:flex-none" aria-label="Assign to">
                <option value="none">Unassigned</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === userId ? "Me" : m.full_name || m.email}</option>)}
              </Select>
              <label className="flex shrink-0 items-center gap-2 text-[12px] text-white/55" title="When on, your automations, flows and AI agent can reply in this chat">
                <Bot size={14} /> Bot <Toggle checked={conv.inbox_status === "bot"} onChange={(v) => patch({ inbox_status: v ? "bot" : "intervened" })} label="Automation for this conversation" />
              </label>
              <Button size="sm" className="shrink-0" variant={conv.status === "open" ? "soft" : "ghost"} onClick={() => patch({ status: conv.status === "open" ? "resolved" : "open" }, conv.status === "open" ? "Marked resolved" : "Reopened")}>
                {conv.status === "open" ? <><Check size={14} /> Resolve</> : "Reopen"}
              </Button>
            </div>
          )}
          <button onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? setPanel((p) => !p) : setMobilePanel(true))} className="rounded-md p-1.5 text-white/50 hover:bg-white/10" aria-label="Toggle contact panel"><UserRound size={18} /></button>
        </header>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(ellipse_at_top,rgba(236,72,153,0.06),transparent_60%)] px-3 py-3 sm:px-4 sm:py-4"
          onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
          {!msgs && <Spinner />}
          {msgs?.length === 0 && <div className="py-16 text-center text-[13px] text-white/40">No messages yet. Say hello 👋</div>}
          {msgs?.map((m, i) => <Bubble key={m.id} m={m} prev={msgs[i - 1]} members={members} />)}
          <div ref={bottomRef} />
        </div>

        {err && <div className="px-3 pt-3 sm:px-4"><Alert onClose={() => setErr(null)}>{err}</Alert></div>}

        {canWrite ? (
          <footer className="border-t border-white/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
            {blocked && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>Instagram only allows replies within 24 hours of the person&apos;s last message. You can reply again as soon as they message you.</span>
              </div>
            )}
            {mode === "reply" && !windowOpen && humanAgentOpen && <div className="mb-1.5 text-[11px] text-amber-200/80">24h window closed — replying as a human agent until {fmtDateTime(conv.human_agent_until)}</div>}
            {mode === "reply" && windowOpen && conv.window_expires_at && <div className="mb-1.5 text-[11px] text-white/35">You can reply until {fmtDateTime(conv.window_expires_at)}</div>}
            <div className="mb-2 flex items-center gap-1">
              {(["reply", "note"] as const).map((k) => (
                <button key={k} onClick={() => setMode(k)} className={cx("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px]", mode === k ? "bg-white/10 text-white" : "text-white/45 hover:text-white/75")}>
                  {k === "reply" ? <Send size={12} /> : <StickyNote size={12} />} {k === "reply" ? "Reply" : "Private note"}
                </button>
              ))}
            </div>
            <div className="relative">
              {shortcutMatches.length > 0 && (
                <div className="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-white/10 bg-surface shadow-xl">
                  {shortcutMatches.map((q) => (
                    <button key={q.id} onClick={() => setText(q.text)} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-white/[0.06]">
                      <Zap size={13} className="mt-1 text-amber-300" /><span className="min-w-0"><span className="text-[12.5px] font-medium text-white">/{q.shortcut}</span><span className="block truncate text-[12px] text-white/45">{q.text}</span></span>
                    </button>
                  ))}
                </div>
              )}
              <div className={cx("flex items-end gap-0.5 rounded-xl border p-1.5 sm:gap-2 sm:p-2", mode === "note" ? "border-amber-500/30 bg-amber-500/[0.06]" : "border-white/10 bg-white/[0.03]")}>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} disabled={blocked || sending} aria-label={mode === "note" ? "Private note" : "Message"}
                  placeholder={blocked ? "Waiting for them to message again" : mode === "note" ? "Only your team can see this note…" : "Type a message… (type / for quick replies)"}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
                  className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-[13.5px] text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50" />
                <button onClick={() => setShowAttach(true)} disabled={blocked || sending || mode === "note"} className="rounded-md p-2 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30" aria-label="Attach media" title="Send a photo, video or file"><Paperclip size={17} /></button>
                <button onClick={() => setShowButtons(true)} disabled={blocked || sending || mode === "note"} className="rounded-md p-2 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30" aria-label="Send link buttons" title="Message with link buttons"><Link2 size={17} /></button>
                <button onClick={() => setShowPay(true)} disabled={sending || mode === "note"} className="rounded-md p-2 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30" aria-label="Request payment" title="Request payment"><IndianRupee size={17} /></button>
                <Button onClick={submit} loading={sending} disabled={!text.trim() || blocked}><Send size={15} /></Button>
              </div>
            </div>
          </footer>
        ) : <footer className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[12.5px] text-white/40">Your role is read-only.</footer>}
      </section>

      {panel && <ContactPanel conv={conv} onChanged={async () => { await loadConv(); onChanged(); }} canWrite={canWrite} className="hidden w-[300px] shrink-0 border-l border-white/10 lg:block" />}
      {mobilePanel && (
        <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true" aria-label="Contact details">
          <button type="button" aria-label="Close contact details" onClick={() => setMobilePanel(false)} className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-y-0 right-0 flex w-[90vw] max-w-sm flex-col bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-[14.5px] font-semibold text-white">Contact details</span>
              <button onClick={() => setMobilePanel(false)} aria-label="Close" className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"><X size={18} /></button>
            </div>
            <ContactPanel conv={conv} onChanged={async () => { await loadConv(); onChanged(); }} canWrite={canWrite} className="min-h-0 flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]" />
          </div>
        </div>
      )}
      <PaymentLinkModal open={showPay} onClose={() => setShowPay(false)} contact={{ id: c.id, name: c.name }} onInsert={(t) => { setMode("reply"); setText((prev) => (prev ? `${prev}
${t}` : t)); }} />
      <AttachModal open={showAttach} onClose={() => setShowAttach(false)} onSend={async (b) => { await send(b); setShowAttach(false); toast("Sent"); }} />
      <ButtonsModal open={showButtons} onClose={() => setShowButtons(false)} initialText={text} onSend={async (b) => { await send(b); setShowButtons(false); setText(""); toast("Sent"); }} />
    </div>
  );
}

// ---- message bubble -------------------------------------------------------------------------------------------------------------------------------------

function Ticks({ m }: { m: ChatMessage }) {
  if (m.status === "failed") return <AlertTriangle size={13} className="text-red-400" aria-label="Failed" />;
  if (m.status === "read") return <CheckCheck size={14} className="text-sky-400" aria-label="Seen" />;
  if (m.status === "sent") return <Check size={14} className="text-white/45" aria-label="Sent" />;
  return <Clock size={12} className="text-white/35" aria-label="Sending" />;
}

function Media({ m }: { m: ChatMessage }) {
  const [failed, setFailed] = useState(false);
  const url = m.media_url;
  // Instagram CDN links expire after a while; show a friendly note instead of a broken image.
  if (!url || failed) return <div className="text-[12px] italic text-white/45">Media unavailable (Instagram links expire after a while).</div>;
  if (m.type === "image" || m.type === "story_mention") {
    return /\.(mp4|mov)(\?|$)/i.test(url) ? <video src={url} controls className="max-h-72 max-w-full rounded-lg" onError={() => setFailed(true)} />
      : <img src={url} alt={m.body ?? "Photo"} className="max-h-72 max-w-full rounded-lg" onError={() => setFailed(true)} />;
  }
  if (m.type === "video" || m.type === "reel") return <video src={url} controls className="max-h-72 max-w-full rounded-lg" onError={() => setFailed(true)} />;
  if (m.type === "audio") return <audio src={url} controls className="max-w-full" onError={() => setFailed(true)} />;
  return <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-[13px] underline"><FileText size={16} /> {m.media_filename ?? (m.type === "share" ? "Shared post" : "Open file")}</a>;
}

function Avatar({ name, src, size }: { name: string; src?: string | null; size: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (name.replace(/^[+@]/, "")[0] ?? "?").toUpperCase();
  if (src && !broken) return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} onError={() => setBroken(true)} />;
  return <div className="flex shrink-0 items-center justify-center rounded-full bg-white/10 font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initial}</div>;
}

type PayloadButton = { title: string; url?: string | null };

function Bubble({ m, prev, members }: { m: ChatMessage; prev?: ChatMessage; members: Member[] }) {
  const out = m.direction === "out";
  const day = new Date(m.created_at).toDateString();
  const newDay = !prev || new Date(prev.created_at).toDateString() !== day;
  const sender = m.sender_type === "agent"
    ? (m.payload.via === "instagram_app" ? "Instagram app" : members.find((x) => x.user_id === m.sender_user_id)?.full_name?.split(" ")[0])
    : { bot: "Auto-reply", ai: "AI agent", flow: "Flow", comment: "Comment → DM", api: "API" }[m.sender_type];
  const buttons = (m.payload.buttons as PayloadButton[] | undefined) ?? [];
  const options = (m.payload.options as { title: string }[] | undefined) ?? [];
  const story = m.payload.story as { url?: string } | undefined;
  return (
    <>
      {newDay && <div className="my-3 text-center text-[11px] text-white/30">{new Date(m.created_at).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</div>}
      <div className={cx("mb-1.5 flex", out ? "justify-end" : "justify-start")}>
        <div className={cx("max-w-[85%] rounded-2xl px-3 py-2 text-[13.5px] shadow-sm sm:max-w-[78%]", m.is_internal ? "border border-amber-500/30 bg-amber-500/10 text-amber-100" : out ? "theme-fixed rounded-br-md text-white" : "rounded-bl-md bg-white/[0.08] text-white")}
          style={out && !m.is_internal ? { background: "#9d174d" } : undefined}>
          {m.is_internal && <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-300"><StickyNote size={11} /> Private note</div>}
          {out && !m.is_internal && sender && <div className="mb-0.5 text-[11px] font-medium text-pink-200/80">{sender}</div>}
          {m.sender_type === "comment" && typeof m.payload.comment_text === "string" && (
            <div className="mb-1.5 flex items-start gap-1.5 rounded-lg bg-black/20 px-2 py-1.5 text-[11.5px] text-white/70"><MessageCircleReply size={12} className="mt-0.5 shrink-0" /> Commented: “{m.payload.comment_text}”</div>
          )}
          {m.type === "story_mention" && <div className="mb-1 flex items-center gap-1 text-[11px] text-white/55"><AtSign size={11} /> Mentioned you in their story</div>}
          {m.type === "story_reply" && (
            <div className="mb-1 flex items-center gap-1 text-[11px] text-white/55">Replied to your story{story?.url && <a href={story.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 underline">view <ExternalLink size={10} /></a>}</div>
          )}
          {m.has_media && <div className="mb-1"><Media m={m} /></div>}
          {m.type === "reaction" ? <span className="inline-flex items-center gap-1"><Heart size={12} /> Reacted {m.body}</span> : m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
          {buttons.length > 0 && (
            <div className="mt-2 space-y-1">{buttons.map((b, i) => (
              <a key={i} href={b.url ?? undefined} target="_blank" rel="noreferrer" className="block rounded-lg bg-black/20 px-3 py-1.5 text-center text-[12.5px] font-medium">{b.title}</a>
            ))}</div>
          )}
          {options.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{options.map((o, i) => <span key={i} className="rounded-full border border-white/25 px-2.5 py-0.5 text-[11.5px]">{o.title}</span>)}</div>}
          {m.error && <div className="mt-1 text-[11.5px] text-red-300">{m.error}</div>}
          <div className="mt-1 flex items-center justify-end gap-1 text-[10.5px] text-white/40">
            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {out && !m.is_internal && <Ticks m={m} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ---- attachment + link-button composers ------------------------------------------------------------------------------------------------------------------

function AttachModal({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (b: SendBody) => Promise<void> }) {
  const [kind, setKind] = useState<"image" | "video" | "audio" | "file">("image");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = /^https?:\/\/\S+$/.test(url.trim());
  return (
    <Modal open={open} onClose={onClose} title="Send a photo, video or file" width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!valid} onClick={async () => {
        setBusy(true); setErr(null);
        try { await onSend({ type: kind, media_url: url.trim() }); setUrl(""); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      }}><Send size={14} /> Send</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="space-y-3">
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="image">Photo</option><option value="video">Video</option><option value="audio">Audio</option><option value="file">File (PDF)</option>
          </Select>
        </Field>
        <Field label="Public link to the file" hint="Instagram fetches the file from this address, so it must be publicly reachable (https). Images up to 8 MB, videos up to 25 MB.">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
    </Modal>
  );
}

function ButtonsModal({ open, onClose, onSend, initialText }: { open: boolean; onClose: () => void; onSend: (b: SendBody) => Promise<void>; initialText: string }) {
  const [text, setText] = useState("");
  const [buttons, setButtons] = useState<{ title: string; url: string }[]>([{ title: "", url: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) setText((t) => t || initialText); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const clean = buttons.filter((b) => b.title.trim() && b.url.trim());
  const ok = text.trim() && clean.length > 0 && clean.every((b) => /^https?:\/\/\S+$/.test(b.url.trim()) && b.title.trim().length <= 20);
  const set = (i: number, k: "title" | "url", v: string) => setButtons((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  return (
    <Modal open={open} onClose={onClose} title="Message with link buttons" width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!ok} onClick={async () => {
        setBusy(true); setErr(null);
        try { await onSend({ type: "buttons", text: text.trim(), buttons: clean.map((b) => ({ title: b.title.trim(), url: b.url.trim() })) }); setButtons([{ title: "", url: "" }]); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      }}><Send size={14} /> Send</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="space-y-3">
        <Field label="Message"><textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={640} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13.5px] text-white focus:outline-none" /></Field>
        {buttons.map((b, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-white/5 p-2 sm:flex-row sm:items-end sm:border-0 sm:p-0">
            <Field label={i === 0 ? "Button text (max 20)" : undefined} className="sm:w-40"><Input value={b.title} maxLength={20} onChange={(e) => set(i, "title", e.target.value)} placeholder="Shop now" /></Field>
            <div className="flex-1"><Field label={i === 0 ? "Opens this link" : undefined}><Input value={b.url} onChange={(e) => set(i, "url", e.target.value)} placeholder="https://…" /></Field></div>
            {buttons.length > 1 && <button onClick={() => setButtons((bs) => bs.filter((_, j) => j !== i))} className="self-end rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white sm:mb-2" aria-label="Remove button"><Trash2 size={14} /></button>}
          </div>
        ))}
        {buttons.length < 3 && <Button size="sm" variant="ghost" onClick={() => setButtons((bs) => [...bs, { title: "", url: "" }])}><Plus size={13} /> Add button</Button>}
      </div>
    </Modal>
  );
}

// ---- contact side panel -----------------------------------------------------------------------------------------------------------------------------------------

function ContactPanel({ conv, onChanged, canWrite, className }: { conv: ConversationDetail; onChanged: () => void; canWrite: boolean; className?: string }) {
  const { toast } = useUi();
  const hasPipeline = useHasFeature("pipeline");
  const c = conv.contact;
  const [tag, setTag] = useState("");
  const [label, setLabel] = useState("");

  const saveTags = async (tags: string[]) => { try { await contactsApi.update(c.id, { tags }); onChanged(); } catch (e) { toast(errorMessage(e), "error"); } };
  const saveLabels = async (labels: string[]) => { try { await inbox.patch(conv.id, { labels }); onChanged(); } catch (e) { toast(errorMessage(e), "error"); } };
  const addTag = () => { const t = tag.trim(); if (t && !c.tags.includes(t)) void saveTags([...c.tags, t]); setTag(""); };
  const addLabel = () => { const l = label.trim(); if (l && !conv.labels.includes(l)) void saveLabels([...conv.labels, l]); setLabel(""); };
  const ad = c.ad_attribution ?? {};

  return (
    <aside className={cx("overflow-y-auto p-4", className)}>
      <div className="text-center">
        <div className="flex justify-center"><Avatar name={c.name} src={c.profile_pic_url} size={64} /></div>
        <div className="mt-2 text-[15px] font-semibold text-white">{c.name}</div>
        {c.username && <a href={`https://instagram.com/${c.username}`} target="_blank" rel="noreferrer" className="text-[12.5px] text-brand-bright hover:underline">@{c.username}</a>}
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          {c.is_follower != null && <Badge tone={c.is_follower ? "green" : undefined}>{c.is_follower ? "Follows you" : "Not following"}</Badge>}
          {c.follower_count != null && <Badge>{c.follower_count.toLocaleString()} followers</Badge>}
        </div>
        {c.phone && <div className="mt-1 text-[12.5px] text-white/50">+{c.phone}</div>}
        {c.email && <div className="text-[12.5px] text-white/50">{c.email}</div>}
      </div>

      <Section title="Labels (this chat)">
        <Chips items={conv.labels} onRemove={canWrite ? (l) => saveLabels(conv.labels.filter((x) => x !== l)) : undefined} />
        {canWrite && <Input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLabel()} placeholder="Add label + Enter" className="mt-2 !py-1.5 text-[12.5px]" />}
      </Section>
      {hasPipeline && <Section title="Deals"><ContactDeals contact={{ id: c.id, name: c.name }} canWrite={canWrite} /></Section>}
      <Section title="Contact tags">
        <Chips items={c.tags} onRemove={canWrite ? (t) => saveTags(c.tags.filter((x) => x !== t)) : undefined} />
        {canWrite && <Input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="Add tag + Enter" className="mt-2 !py-1.5 text-[12.5px]" />}
      </Section>
      {Object.keys(c.traits).length > 0 && (
        <Section title="Details">
          <dl className="space-y-1.5 text-[12.5px]">{Object.entries(c.traits).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-white/45">{k}</dt><dd className="truncate text-right text-white/85">{String(v)}</dd></div>)}</dl>
        </Section>
      )}
      <Section title="Source">
        <div className="text-[12.5px] text-white/70">{c.source}{(ad.ref || ad.ad_id) && <div className="mt-1 rounded-lg bg-white/[0.05] p-2 text-[12px]">{ad.ad_id ? `Ad ${ad.ad_id}` : `Link ref: ${ad.ref}`}</div>}</div>
        <div className="mt-1 text-[11.5px] text-white/35">Customer since {new Date(c.created_at).toLocaleDateString()}</div>
      </Section>
      {conv.events.length > 0 && (
        <Section title="Recent events">
          <ul className="space-y-1.5 text-[12.5px]">{conv.events.slice(0, 6).map((e, i) => <li key={i} className="flex justify-between gap-2"><span className="text-white/80">{e.name}</span><span className="text-white/35">{timeAgo(e.at)}</span></li>)}</ul>
        </Section>
      )}
      {canWrite && (
        <Section title="Messaging consent">
          <label className="flex items-center justify-between text-[12.5px] text-white/70">Opted out of automated messages<Toggle checked={c.opted_out} onChange={async (v) => { try { await contactsApi.update(c.id, { opted_out: v }); onChanged(); toast(v ? "Marked as opted out" : "Opted in again"); } catch (e) { toast(errorMessage(e), "error"); } }} label="Opted out" /></label>
        </Section>
      )}
      <Link href="/dashboard/contacts" className="mt-4 block text-center text-[12.5px] text-sky-300 hover:underline">Open in Contacts →</Link>
    </aside>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-5"><div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">{title}</div>{children}</div>;
}
function Chips({ items, onRemove }: { items: string[]; onRemove?: (v: string) => void }) {
  if (items.length === 0) return <div className="text-[12px] text-white/30">None yet</div>;
  return <div className="flex flex-wrap gap-1.5">{items.map((i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[12px] text-white/80">{i}{onRemove && <button onClick={() => onRemove(i)} aria-label={`Remove ${i}`} className="text-white/40 hover:text-white"><X size={11} /></button>}</span>)}</div>;
}

