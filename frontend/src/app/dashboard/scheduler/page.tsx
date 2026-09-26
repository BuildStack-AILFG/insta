"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Copy, ExternalLink, Film, FolderOpen, Image as ImageIcon, Layers, List, Plus, Send, Trash2, X } from "lucide-react";
import { Alert, Badge, Button, Card, cx, EmptyState, Field, fmtDateTime, Input, Modal, Page, PageHeader, Select, Spinner, Tabs, Textarea, usePoll, useUi } from "@/components/ui/kit";
import AiWriteButton from "@/components/dashboard/AiWriteButton";
import { MediaLibraryPanel, MediaLibraryPicker } from "@/components/dashboard/MediaLibrary";
import { errorMessage, instagram, posts as api, type IgAccount, type PostInput, type PostKind, type PostMedia, type ScheduledPost } from "@/lib/api";

const KINDS: { id: PostKind; label: string; icon: typeof ImageIcon; hint: string }[] = [
  { id: "image", label: "Photo", icon: ImageIcon, hint: "One image" },
  { id: "carousel", label: "Carousel", icon: Layers, hint: "2–10 images or videos" },
  { id: "reel", label: "Reel", icon: Film, hint: "One vertical video (MP4/MOV)" },
  { id: "story", label: "Story", icon: CalendarClock, hint: "One image or video" },
];
const STATUS_TONE: Record<ScheduledPost["status"], "gray" | "yellow" | "green" | "red" | "blue"> = {
  scheduled: "blue", processing: "yellow", published: "green", failed: "red", cancelled: "gray",
};
const STATUS_DOT: Record<ScheduledPost["status"], string> = {
  scheduled: "bg-sky-400", processing: "bg-amber-400", published: "bg-emerald-400", failed: "bg-red-400", cancelled: "bg-white/30",
};
const isVideo = (url: string) => /\.(mp4|mov|m4v)(\?|$)/i.test(url);
const EDITABLE = ["scheduled", "failed", "cancelled"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type View = "list" | "calendar" | "media";
type Draft = { post: ScheduledPost | null; copy?: ScheduledPost; when?: Date };

export default function SchedulerPage() {
  const { toast, confirm } = useUi();
  const [view, setView] = useState<View>("list");
  const [tab, setTab] = useState<"upcoming" | "published" | "other">("upcoming");
  const [list, setList] = useState<ScheduledPost[] | null>(null);
  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => { try { setList(await api.list()); } catch (e) { setError(errorMessage(e, "Couldn't load posts.")); } }, []);
  usePoll(load, 10000, []);
  useEffect(() => { instagram.list().then((a) => setAccounts(a.filter((x) => x.status !== "disconnected"))).catch(() => setAccounts([])); }, []);
  const reload = () => { void load(); setRefresh((n) => n + 1); };

  const shown = useMemo(() => (list ?? []).filter((p) => (tab === "upcoming" ? ["scheduled", "processing"].includes(p.status) : tab === "published" ? p.status === "published" : ["failed", "cancelled"].includes(p.status)))
    .sort((a, b) => (tab === "upcoming" ? a.scheduled_at.localeCompare(b.scheduled_at) : b.scheduled_at.localeCompare(a.scheduled_at))), [list, tab]);
  const count = (s: string[]) => (list ?? []).filter((p) => s.includes(p.status)).length;
  const noAccount = accounts !== null && accounts.length === 0;

  const cancel = async (p: ScheduledPost) => { try { await api.cancel(p.id); reload(); toast("Post cancelled"); } catch (e) { toast(errorMessage(e), "error"); } };
  const remove = async (p: ScheduledPost) => {
    if (!(await confirm({ title: "Remove this post from GramForGrow?", body: p.status === "published" ? "It stays on Instagram." : undefined, confirmLabel: "Remove", danger: true }))) return;
    try { await api.remove(p.id); reload(); } catch (e) { toast(errorMessage(e), "error"); }
  };

  return (
    <Page wide={view === "calendar"}>
      <PageHeader icon={<CalendarClock size={20} />} title="Scheduler" subtitle="Plan photos, carousels, reels and stories and publish them automatically at the right time."
        actions={!noAccount && <Button onClick={() => setDraft({ post: null })} disabled={!accounts}><Plus size={15} /> New post</Button>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      {noAccount ? (
        <EmptyState icon={<CalendarClock size={22} />} title="Connect Instagram first" body="Posts are published to your connected account." action={<Link href="/dashboard/instagram"><Button>Connect Instagram</Button></Link>} />
      ) : (
        <>
          <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {([["list", "List", List], ["calendar", "Calendar", CalendarDays], ["media", "Media library", FolderOpen]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setView(id)}
                className={cx("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition", view === id ? "bg-[var(--brand)] text-white" : "text-white/60 hover:text-white")}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {view === "media" && <Card className="p-4"><MediaLibraryPanel /></Card>}

          {view === "calendar" && <Calendar refresh={refresh} onOpen={(p) => (EDITABLE.includes(p.status) ? setDraft({ post: p }) : p.permalink ? window.open(p.permalink, "_blank", "noopener") : undefined)}
            onNew={(when) => setDraft({ post: null, when })} onMoved={() => { void load(); }} />}

          {view === "list" && (
            <>
              <Tabs tabs={[{ id: "upcoming", label: "Upcoming", count: count(["scheduled", "processing"]) }, { id: "published", label: "Published", count: count(["published"]) }, { id: "other", label: "Failed & cancelled", count: count(["failed", "cancelled"]) }]} value={tab} onChange={setTab} />
              {!list ? <Spinner /> : shown.length === 0 ? (
                <EmptyState icon={<CalendarClock size={22} />} title={tab === "upcoming" ? "Nothing scheduled" : "Nothing here yet"} body="Schedule a week of content in one sitting — it goes out on its own." action={tab === "upcoming" ? <Button onClick={() => setDraft({ post: null })}><Plus size={15} /> Schedule a post</Button> : undefined} />
              ) : (
                <div className="space-y-3">{shown.map((p) => (
                  <Card key={p.id} className="flex flex-wrap items-start gap-4 p-4">
                    <Thumb media={p.media} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                        <span className="text-[12.5px] text-white/50">{KINDS.find((k) => k.id === p.kind)?.label} · @{p.account_username}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13.5px] text-white/85">{p.caption || <span className="text-white/35">No caption</span>}</p>
                      <div className="mt-1 text-[12px] text-white/45">{p.status === "published" ? `Published ${fmtDateTime(p.published_at)}` : `${p.status === "processing" ? "Publishing — Instagram is processing the files" : "Scheduled for"} ${p.status === "processing" ? "" : fmtDateTime(p.scheduled_at)}`}</div>
                      {p.error && <div className={cx("mt-1 text-[12px]", p.status === "failed" ? "text-red-300" : "text-amber-200/80")}>{p.error}</div>}
                    </div>
                    <div className="flex gap-2">
                      {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink size={13} /> View</Button></a>}
                      {EDITABLE.includes(p.status) && <Button size="sm" variant="ghost" onClick={() => setDraft({ post: p })}>{p.status === "scheduled" ? "Edit" : "Edit & retry"}</Button>}
                      <Button size="sm" variant="ghost" aria-label="Duplicate" title="Duplicate" onClick={() => setDraft({ post: null, copy: p })}><Copy size={13} /></Button>
                      {p.status === "scheduled" && <Button size="sm" variant="ghost" onClick={() => cancel(p)}>Cancel</Button>}
                      {p.status !== "processing" && <Button size="sm" variant="danger" aria-label="Delete" onClick={() => remove(p)}><Trash2 size={13} /></Button>}
                    </div>
                  </Card>
                ))}</div>
              )}
            </>
          )}
        </>
      )}
      {draft && accounts && accounts.length > 0 && <Composer draft={draft} accounts={accounts} onClose={() => setDraft(null)}
        onSaved={(p) => { setDraft(null); toast(p.status === "published" ? "Published 🎉" : p.status === "processing" ? "Publishing — Instagram is processing your video" : "Post scheduled"); reload(); }} />}
    </Page>
  );
}

function Thumb({ media, className = "h-20 w-20 rounded-xl" }: { media: PostMedia[]; className?: string }) {
  const first = media[0];
  return (
    <div className={cx("relative shrink-0 overflow-hidden bg-white/[0.06]", className)}>
      {first ? (first.type === "video" ? <video src={first.url} muted preload="metadata" className="h-full w-full object-cover" /> : <img src={first.url} alt="" className="h-full w-full object-cover" />) : null}
      {media.length > 1 && <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">{media.length}</span>}
    </div>
  );
}

// ---- calendar ---------------------------------------------------------------------------------------------------------------

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // back to Monday
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function Calendar({ refresh, onOpen, onNew, onMoved }: { refresh: number; onOpen: (p: ScheduledPost) => void; onNew: (when: Date) => void; onMoved: () => void }) {
  const { toast } = useUi();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [items, setItems] = useState<ScheduledPost[] | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [today] = useState(() => startOfDay(new Date()));
  const days = useMemo(() => monthGrid(month), [month]);

  const load = useCallback(async () => {
    const end = new Date(days[41]); end.setDate(end.getDate() + 1);
    try { setItems(await api.list({ start: days[0].toISOString(), end: end.toISOString() })); } catch (e) { toast(errorMessage(e, "Couldn't load the calendar."), "error"); }
  }, [days, toast]);
  usePoll(load, 15000, [load, refresh]);

  const byDay = useMemo(() => {
    const m = new Map<string, ScheduledPost[]>();
    (items ?? []).filter((p) => p.status !== "cancelled").forEach((p) => {
      const k = dayKey(new Date(p.published_at ?? p.scheduled_at));
      m.set(k, [...(m.get(k) ?? []), p]);
    });
    m.forEach((v) => v.sort((a, b) => (a.published_at ?? a.scheduled_at).localeCompare(b.published_at ?? b.scheduled_at)));
    return m;
  }, [items]);

  const drop = async (day: Date, id: string) => {
    const p = items?.find((x) => x.id === id);
    if (!p || p.status !== "scheduled") return;
    const old = new Date(p.scheduled_at);
    const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes());
    if (dayKey(when) === dayKey(old)) return;
    if (when.getTime() < new Date().getTime()) { toast("That time has already passed — pick a later day.", "error"); return; }
    setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, scheduled_at: when.toISOString() } : x)) ?? null); // optimistic
    try { await api.reschedule(id, when.toISOString()); toast(`Moved to ${fmtDateTime(when.toISOString())}`); onMoved(); } catch (e) { toast(errorMessage(e), "error"); }
    void load();
  };

  const newOn = (day: Date) => {
    const now = new Date();
    const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0);
    if (when.getTime() < now.getTime() + 10 * 60 * 1000) { when.setTime(now.getTime() + 60 * 60 * 1000); when.setMinutes(0, 0, 0); }
    onNew(when);
  };

  const scheduledThisMonth = (items ?? []).filter((p) => p.status === "scheduled" && new Date(p.scheduled_at).getMonth() === month.getMonth()).length;

  return (
    <Card className="p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[16px] font-semibold text-white">{month.toLocaleDateString([], { month: "long", year: "numeric" })}
          <span className="ml-2 text-[12px] font-normal text-white/45">{scheduledThisMonth} scheduled</span></h2>
        <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={15} /></Button>
        <Button size="sm" variant="ghost" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
        <Button size="sm" variant="ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={15} /></Button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 gap-1 pb-1">{WEEKDAYS.map((d) => <div key={d} className="px-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const k = dayKey(day);
              const posts = byDay.get(k) ?? [];
              const past = day < today;
              const inMonth = day.getMonth() === month.getMonth();
              const isToday = k === dayKey(today);
              return (
                <div key={k}
                  onDragOver={(e) => { if (!past) { e.preventDefault(); setOver(k); } }} onDragLeave={() => setOver((o) => (o === k ? null : o))}
                  onDrop={(e) => { e.preventDefault(); setOver(null); void drop(day, e.dataTransfer.getData("text/plain")); }}
                  className={cx("group flex min-h-[112px] flex-col rounded-lg border p-1.5 transition",
                    over === k ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]" : "border-white/[0.07]",
                    inMonth ? "bg-white/[0.025]" : "bg-transparent opacity-50", past && "opacity-60")}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cx("grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px]", isToday ? "bg-[var(--brand)] font-semibold text-white" : "text-white/60")}>{day.getDate()}</span>
                    {!past && <button type="button" onClick={() => newOn(day)} aria-label={`New post on ${day.toDateString()}`}
                      className="rounded p-0.5 text-white/40 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100 focus:opacity-100"><Plus size={13} /></button>}
                  </div>
                  <div className="space-y-1">
                    {posts.slice(0, 4).map((p) => (
                      <button key={p.id} type="button" draggable={p.status === "scheduled"} onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; }}
                        onClick={() => onOpen(p)} title={`${p.caption || "No caption"}\n${p.status} · @${p.account_username}`}
                        className={cx("flex w-full items-center gap-1.5 rounded-md bg-white/[0.06] p-1 text-left hover:bg-white/[0.12]", p.status === "scheduled" && "cursor-grab active:cursor-grabbing")}>
                        <Thumb media={p.media} className="h-7 w-7 rounded" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-[10.5px] text-white/55"><span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[p.status])} />
                            {new Date(p.published_at ?? p.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                          <span className="block truncate text-[11px] text-white/85">{p.caption || KINDS.find((x) => x.id === p.kind)?.label}</span>
                        </span>
                      </button>
                    ))}
                    {posts.length > 4 && <div className="px-1 text-[10.5px] text-white/45">+{posts.length - 4} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11.5px] text-white/45">
        {(["scheduled", "processing", "published", "failed"] as const).map((s) => <span key={s} className="inline-flex items-center gap-1"><span className={cx("h-2 w-2 rounded-full", STATUS_DOT[s])} />{s}</span>)}
        <span className="ml-auto">Drag a scheduled post to another day to move it · hover a day and press + to plan one</span>
      </div>
      {!items && <Spinner />}
    </Card>
  );
}

// ---- composer ---------------------------------------------------------------------------------------------------------------

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultTime(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

const outOfFeedRatio = (m: PostMedia) => m.type === "image" && !!m.width && !!m.height && (m.width / m.height < 0.8 || m.width / m.height > 1.91);

function Composer({ draft, accounts, onClose, onSaved }: { draft: Draft; accounts: IgAccount[]; onClose: () => void; onSaved: (p: ScheduledPost) => void }) {
  const { post } = draft;
  const source = post ?? draft.copy ?? null;
  const [f, setF] = useState<PostInput>(() => source ? { account_id: source.account_id, kind: source.kind, caption: source.caption, media: source.media, first_comment: source.first_comment }
    : { account_id: accounts[0].id, kind: "image", caption: "", media: [], first_comment: "" });
  const [when, setWhen] = useState(() => toLocalInput(post && post.status === "scheduled" ? new Date(post.scheduled_at) : draft.when ?? defaultTime()));
  const [url, setUrl] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<"now" | "schedule" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [limit, setLimit] = useState<{ used: number; limit: number } | null>(null);
  const set = (p: Partial<PostInput>) => setF((x) => ({ ...x, ...p }));
  useEffect(() => { api.limit(f.account_id).then(setLimit).catch(() => setLimit(null)); }, [f.account_id]);

  const maxItems = f.kind === "carousel" ? 10 : 1;
  const addUrl = () => {
    const u = url.trim();
    if (!/^https:\/\/\S+$/.test(u)) { setErr("Paste a public https:// link to the image or video."); return; }
    setErr(null);
    set({ media: [...f.media, { url: u, type: isVideo(u) ? "video" : "image" } as PostMedia].slice(0, maxItems) });
    setUrl("");
  };
  const hashtags = (f.caption.match(/#/g) ?? []).length;
  const problems = [
    f.kind === "image" && (f.media.length !== 1 || f.media[0].type !== "image") && "A photo post needs exactly one image.",
    f.kind === "reel" && (f.media.length !== 1 || f.media[0].type !== "video") && "A reel needs exactly one video.",
    f.kind === "story" && f.media.length !== 1 && "A story needs one image or video.",
    f.kind === "carousel" && (f.media.length < 2 || f.media.length > 10) && "A carousel needs 2 to 10 items.",
    (f.kind === "image" || f.kind === "carousel") && f.media.some(outOfFeedRatio) && "A photo is outside the feed's 4:5 – 1.91:1 shape — crop it or post it as a story.",
    f.caption.length > 2200 && "Captions can be at most 2,200 characters.",
    hashtags > 30 && "Instagram allows at most 30 hashtags.",
  ].filter(Boolean) as string[];

  const submit = async (now: boolean) => {
    setBusy(now ? "now" : "schedule"); setErr(null);
    const media = f.media.map((m) => (m.asset_id ? { asset_id: m.asset_id, url: "", type: m.type } : { url: m.url, type: m.type }));
    const body: PostInput = { ...f, media, publish_now: now, scheduled_at: now ? null : new Date(when).toISOString() };
    try { onSaved(post ? await api.update(post.id, body) : await api.create(body)); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  };

  return (
    <Modal open onClose={onClose} title={post ? "Edit post" : draft.copy ? "Duplicate post" : "New post"} width={720}
      footer={<><span className="mr-auto text-[12px] text-amber-200/80">{problems[0] ?? (limit ? `${limit.used} of ${limit.limit} posts used in the last 24 hours` : "")}</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="ghost" loading={busy === "now"} disabled={problems.length > 0 || !!busy} onClick={() => submit(true)}><Send size={14} /> Publish now</Button>
        <Button loading={busy === "schedule"} disabled={problems.length > 0 || !!busy} onClick={() => submit(false)}><CalendarClock size={14} /> Schedule</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Account"><Select value={f.account_id} onChange={(e) => set({ account_id: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}</Select></Field>
          <Field label="Publish at (your local time)"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{KINDS.map((k) => (
          <button key={k.id} type="button" onClick={() => set({ kind: k.id, media: k.id === "carousel" ? f.media : f.media.slice(0, 1) })}
            className={cx("rounded-xl border p-3 text-left", f.kind === k.id ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")}>
            <k.icon size={16} className="text-brand-bright" /><div className="mt-1 text-[13px] font-semibold text-white">{k.label}</div><div className="text-[11px] text-white/45">{k.hint}</div>
          </button>
        ))}</div>
        <Field label="Media" hint="Upload files to your media library, or paste a public https link (links ending in .mp4 / .mov are treated as video).">
          <div className="flex flex-wrap gap-2">
            {f.media.map((m, i) => (
              <div key={i} className={cx("group relative h-20 w-20 overflow-hidden rounded-lg bg-white/[0.06]", (f.kind === "image" || f.kind === "carousel") && outOfFeedRatio(m) && "ring-2 ring-amber-400")}>
                {m.type === "video" ? <video src={m.url} muted preload="metadata" className="h-full w-full object-cover" /> : <img src={m.url} alt="" className="h-full w-full object-cover" />}
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9.5px] text-white">{m.type}{m.asset_id ? " · library" : ""}</span>
                <button onClick={() => set({ media: f.media.filter((_, j) => j !== i) })} className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="Remove"><X size={12} /></button>
              </div>
            ))}
            {f.media.length < maxItems && (
              <button type="button" onClick={() => setPicking(true)}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-[11px] text-white/60 hover:border-[var(--brand)] hover:text-white">
                <FolderOpen size={16} className="text-brand-bright" /> Upload or<br />pick
              </button>
            )}
          </div>
          {f.media.length < maxItems && (
            <div className="mt-2 flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} placeholder="…or paste a link: https://cdn.example.com/photo.jpg" />
              <Button variant="ghost" onClick={addUrl} disabled={!url.trim()}><Plus size={14} /> Add</Button>
            </div>
          )}
        </Field>
        {f.kind !== "story" && (
          <>
            <div className="-mb-2 flex justify-end"><AiWriteButton purpose="caption" onPick={(t) => set({ caption: t })} /></div>
            <Field label={`Caption · ${f.caption.length}/2200 · ${hashtags}/30 hashtags`}><Textarea rows={5} value={f.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Write a caption… Tip: “Comment LINK and I'll DM it to you” pairs perfectly with a “next post” comment automation." /></Field>
            <Field label="First comment (optional)" hint="Posted right after publishing — handy for hashtags or a pinned call-to-action."><Input value={f.first_comment} onChange={(e) => set({ first_comment: e.target.value })} /></Field>
          </>
        )}
      </div>
      {picking && (
        <MediaLibraryPicker kind={f.kind === "image" ? "image" : f.kind === "reel" ? "video" : undefined} max={maxItems - f.media.length} onClose={() => setPicking(false)}
          onDone={(picked) => {
            setPicking(false);
            set({ media: [...f.media, ...picked.map((a): PostMedia => ({ url: a.url, type: a.kind, asset_id: a.id, width: a.width, height: a.height }))].slice(0, maxItems) });
          }} />
      )}
    </Modal>
  );
}
