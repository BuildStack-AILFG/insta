"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ExternalLink, Film, Image as ImageIcon, Layers, Plus, Send, Trash2, X } from "lucide-react";
import { Alert, Badge, Button, Card, cx, EmptyState, Field, fmtDateTime, Input, Modal, Page, PageHeader, Select, Spinner, Tabs, Textarea, usePoll, useUi } from "@/components/ui/kit";
import AiWriteButton from "@/components/dashboard/AiWriteButton";
import { errorMessage, instagram, posts as api, type IgAccount, type PostInput, type PostKind, type PostMedia, type ScheduledPost } from "@/lib/api";

const KINDS: { id: PostKind; label: string; icon: typeof ImageIcon; hint: string }[] = [
  { id: "image", label: "Photo", icon: ImageIcon, hint: "One image (JPEG)" },
  { id: "carousel", label: "Carousel", icon: Layers, hint: "2–10 images or videos" },
  { id: "reel", label: "Reel", icon: Film, hint: "One vertical video (MP4/MOV)" },
  { id: "story", label: "Story", icon: CalendarClock, hint: "One image or video" },
];
const STATUS_TONE: Record<ScheduledPost["status"], "gray" | "yellow" | "green" | "red" | "blue"> = {
  scheduled: "blue", processing: "yellow", published: "green", failed: "red", cancelled: "gray",
};
const isVideo = (url: string) => /\.(mp4|mov|m4v)(\?|$)/i.test(url);

export default function SchedulerPage() {
  const { toast, confirm } = useUi();
  const [tab, setTab] = useState<"upcoming" | "published" | "other">("upcoming");
  const [list, setList] = useState<ScheduledPost[] | null>(null);
  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  const [editing, setEditing] = useState<ScheduledPost | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => { try { setList(await api.list()); } catch (e) { setError(errorMessage(e, "Couldn't load posts.")); } }, []);
  usePoll(load, 10000, []);
  useEffect(() => { instagram.list().then((a) => setAccounts(a.filter((x) => x.status !== "disconnected"))).catch(() => setAccounts([])); }, []);

  const shown = useMemo(() => (list ?? []).filter((p) => (tab === "upcoming" ? ["scheduled", "processing"].includes(p.status) : tab === "published" ? p.status === "published" : ["failed", "cancelled"].includes(p.status)))
    .sort((a, b) => (tab === "upcoming" ? a.scheduled_at.localeCompare(b.scheduled_at) : b.scheduled_at.localeCompare(a.scheduled_at))), [list, tab]);
  const count = (s: string[]) => (list ?? []).filter((p) => s.includes(p.status)).length;
  const noAccount = accounts !== null && accounts.length === 0;

  return (
    <Page>
      <PageHeader icon={<CalendarClock size={20} />} title="Scheduler" subtitle="Plan photos, carousels, reels and stories and publish them automatically at the right time."
        actions={!noAccount && <Button onClick={() => setEditing("new")} disabled={!accounts}><Plus size={15} /> New post</Button>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      {noAccount ? (
        <EmptyState icon={<CalendarClock size={22} />} title="Connect Instagram first" body="Posts are published to your connected account." action={<Link href="/dashboard/instagram"><Button>Connect Instagram</Button></Link>} />
      ) : (
        <>
          <Tabs tabs={[{ id: "upcoming", label: "Upcoming", count: count(["scheduled", "processing"]) }, { id: "published", label: "Published", count: count(["published"]) }, { id: "other", label: "Failed & cancelled", count: count(["failed", "cancelled"]) }]} value={tab} onChange={setTab} />
          {!list ? <Spinner /> : shown.length === 0 ? (
            <EmptyState icon={<CalendarClock size={22} />} title={tab === "upcoming" ? "Nothing scheduled" : "Nothing here yet"} body="Schedule a week of content in one sitting — it goes out on its own." action={tab === "upcoming" ? <Button onClick={() => setEditing("new")}><Plus size={15} /> Schedule a post</Button> : undefined} />
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
                  {["scheduled", "failed", "cancelled"].includes(p.status) && <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>{p.status === "scheduled" ? "Edit" : "Edit & retry"}</Button>}
                  {p.status === "scheduled" && <Button size="sm" variant="ghost" onClick={async () => { try { await api.cancel(p.id); await load(); toast("Post cancelled"); } catch (e) { toast(errorMessage(e), "error"); } }}>Cancel</Button>}
                  {p.status !== "processing" && <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => { if (await confirm({ title: "Remove this post from GramForGrow?", body: p.status === "published" ? "It stays on Instagram." : undefined, confirmLabel: "Remove", danger: true })) { try { await api.remove(p.id); await load(); } catch (e) { toast(errorMessage(e), "error"); } } }}><Trash2 size={13} /></Button>}
                </div>
              </Card>
            ))}</div>
          )}
        </>
      )}
      {editing && accounts && accounts.length > 0 && <Composer post={editing === "new" ? null : editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={(p) => { setEditing(null); toast(p.status === "published" ? "Published 🎉" : p.status === "processing" ? "Publishing — Instagram is processing your video" : "Post scheduled"); void load(); }} />}
    </Page>
  );
}

function Thumb({ media }: { media: PostMedia[] }) {
  const first = media[0];
  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/[0.06]">
      {first ? (first.type === "video" ? <video src={first.url} muted className="h-full w-full object-cover" /> : <img src={first.url} alt="" className="h-full w-full object-cover" />) : null}
      {media.length > 1 && <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">{media.length}</span>}
    </div>
  );
}

function defaultTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Composer({ post, accounts, onClose, onSaved }: { post: ScheduledPost | null; accounts: IgAccount[]; onClose: () => void; onSaved: (p: ScheduledPost) => void }) {
  const [f, setF] = useState<PostInput>(() => post ? { account_id: post.account_id, kind: post.kind, caption: post.caption, media: post.media, first_comment: post.first_comment }
    : { account_id: accounts[0].id, kind: "image", caption: "", media: [], first_comment: "" });
  const [when, setWhen] = useState(post && post.status === "scheduled" ? toLocalInput(post.scheduled_at) : defaultTime());
  const [url, setUrl] = useState("");
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
    const item: PostMedia = { url: u, type: isVideo(u) ? "video" : "image" };
    set({ media: [...f.media, item].slice(0, maxItems) });
    setUrl("");
  };
  const hashtags = (f.caption.match(/#/g) ?? []).length;
  const problems = [
    f.kind === "image" && (f.media.length !== 1 || f.media[0].type !== "image") && "A photo post needs exactly one image.",
    f.kind === "reel" && (f.media.length !== 1 || f.media[0].type !== "video") && "A reel needs exactly one video.",
    f.kind === "story" && f.media.length !== 1 && "A story needs one image or video.",
    f.kind === "carousel" && (f.media.length < 2 || f.media.length > 10) && "A carousel needs 2 to 10 items.",
    f.caption.length > 2200 && "Captions can be at most 2,200 characters.",
    hashtags > 30 && "Instagram allows at most 30 hashtags.",
  ].filter(Boolean) as string[];

  const submit = async (now: boolean) => {
    setBusy(now ? "now" : "schedule"); setErr(null);
    const body: PostInput = { ...f, publish_now: now, scheduled_at: now ? null : new Date(when).toISOString() };
    try { onSaved(post ? await api.update(post.id, body) : await api.create(body)); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  };

  return (
    <Modal open onClose={onClose} title={post ? "Edit post" : "New post"} width={720}
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
        <Field label="Media" hint="Instagram downloads files from these links, so they must be public https URLs (e.g. from your CDN, Cloudinary or S3). Links ending in .mp4 / .mov are treated as video.">
          <div className="flex flex-wrap gap-2">
            {f.media.map((m, i) => (
              <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-lg bg-white/[0.06]">
                {m.type === "video" ? <video src={m.url} muted className="h-full w-full object-cover" /> : <img src={m.url} alt="" className="h-full w-full object-cover" />}
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9.5px] text-white">{m.type}</span>
                <button onClick={() => set({ media: f.media.filter((_, j) => j !== i) })} className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="Remove"><X size={12} /></button>
              </div>
            ))}
          </div>
          {f.media.length < maxItems && (
            <div className="mt-2 flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} placeholder="https://cdn.example.com/photo.jpg" />
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
    </Modal>
  );
}
