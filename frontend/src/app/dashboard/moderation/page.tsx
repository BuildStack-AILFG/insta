"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Link2, ShieldCheck, X } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input, Page, PageHeader, Select, Spinner, Toggle, timeAgo, useUi } from "@/components/ui/kit";
import { commentAutomations, errorMessage, getSettings, patchSettings, type CommentActivity } from "@/lib/api";

type Moderation = { enabled: boolean; keywords: string[]; hide_links: boolean; max_mentions: number; use_ai: boolean; action: "hide" | "delete" };
const DEFAULTS: Moderation = { enabled: false, keywords: [], hide_links: false, max_mentions: 0, use_ai: false, action: "hide" };
const STARTER_WORDS = ["free followers", "dm me to earn", "check my profile", "crypto", "investment plan", "scam"];

export default function ModerationPage() {
  const { toast } = useUi();
  const [m, setM] = useState<Moderation | null>(null);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<CommentActivity[] | null>(null);

  const loadRecent = useCallback(() => commentAutomations.activity({ outcome: "moderated", limit: 30 }).then((r) => setRecent(r.items)).catch(() => setRecent([])), []);
  useEffect(() => {
    getSettings().then(({ settings }) => setM({ ...DEFAULTS, ...((settings.moderation as Partial<Moderation>) ?? {}) })).catch((e) => setErr(errorMessage(e)));
    void loadRecent();
  }, [loadRecent]);

  if (!m) return err ? <Page><Alert>{err}</Alert></Page> : <Spinner />;
  const set = (p: Partial<Moderation>) => setM({ ...m, ...p });
  const addWords = (text: string) => {
    const words = text.split(",").map((w) => w.trim()).filter(Boolean);
    set({ keywords: [...new Set([...m.keywords, ...words.map((w) => w.slice(0, 60))])].slice(0, 200) });
    setWord("");
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = await patchSettings({ moderation: m }); setM({ ...DEFAULTS, ...(r.settings.moderation as Moderation) }); toast("Moderation saved"); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const unhide = async (row: CommentActivity) => {
    try { await commentAutomations.moderate(row.id, "unhide"); toast("Comment visible again"); void loadRecent(); } catch (e) { toast(errorMessage(e), "error"); }
  };

  return (
    <Page>
      <PageHeader icon={<ShieldCheck size={20} />} title="Comment moderation"
        subtitle="Automatically hide spam, scams and abuse under your posts — before your comment automations reply to them."
        actions={<label className="flex items-center gap-2 text-[13px] text-white/60">Moderation <Toggle checked={m.enabled} label="Moderation enabled" onChange={(v) => set({ enabled: v })} /></label>} />
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      {!m.enabled && <Alert tone="yellow">Moderation is off. Turn it on at the top right, then save.</Alert>}

      <div className="space-y-4">
        <Card className="p-5">
          <div className="mb-1 text-[14.5px] font-semibold text-white">Blocked words and phrases</div>
          <p className="mb-3 text-[12.5px] text-white/50">Comments containing any of these (whole words, any capitalisation) are moderated.</p>
          <div className="flex flex-wrap gap-1.5">
            {m.keywords.map((k) => <span key={k} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[12.5px] text-white">{k}<button onClick={() => set({ keywords: m.keywords.filter((x) => x !== k) })} aria-label={`Remove ${k}`} className="text-white/40 hover:text-white"><X size={11} /></button></span>)}
            {m.keywords.length === 0 && <span className="text-[12.5px] text-white/35">No words yet.</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && word.trim()) addWords(word); }} placeholder="Add words, separated by commas" className="max-w-md" />
            <Button variant="ghost" disabled={!word.trim()} onClick={() => addWords(word)}>Add</Button>
            {m.keywords.length === 0 && <Button variant="ghost" onClick={() => addWords(STARTER_WORDS.join(","))}>Add common spam phrases</Button>}
          </div>
        </Card>

        <Card className="grid gap-4 p-5 md:grid-cols-2">
          <label className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-4 py-3 text-[13px] text-white/80">
            <span><span className="flex items-center gap-1.5 font-semibold text-white"><Link2 size={14} /> Hide comments with links</span><span className="text-[12px] text-white/45">Most spam links to a profile or a website.</span></span>
            <Toggle checked={m.hide_links} label="Hide links" onChange={(v) => set({ hide_links: v })} />
          </label>
          <label className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-4 py-3 text-[13px] text-white/80">
            <span><span className="flex items-center gap-1.5 font-semibold text-white"><Bot size={14} /> Let AI catch the rest</span><span className="text-[12px] text-white/45">Classifies each comment as spam, abusive or fine. Uses your AI replies allowance.</span></span>
            <Toggle checked={m.use_ai} label="AI moderation" onChange={(v) => set({ use_ai: v })} />
          </label>
          <Field label="Too many @mentions" hint="Mass-tagging is a common spam pattern. 0 turns this off. Tip: turn it off while a “tag 3 friends” giveaway is running.">
            <Input type="number" min={0} max={50} value={m.max_mentions} onChange={(e) => set({ max_mentions: Math.max(0, Number(e.target.value) || 0) })} className="max-w-[120px]" />
          </Field>
          <Field label="What to do with them" hint="Hidden comments stay visible to the person who wrote them and their followers, but nobody else. You can unhide them below.">
            <Select value={m.action} onChange={(e) => set({ action: e.target.value as Moderation["action"] })} className="max-w-[220px]"><option value="hide">Hide (reversible)</option><option value="delete">Delete permanently</option></Select>
          </Field>
        </Card>
        <div className="flex justify-end"><Button loading={busy} onClick={save}>Save moderation</Button></div>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><div className="text-[14.5px] font-semibold text-white">Recently moderated</div><Link href="/dashboard/comment-automations" className="text-[12.5px] text-sky-300 hover:underline">All comment activity →</Link></div>
          {!recent ? <Spinner /> : recent.length === 0 ? <p className="text-[13px] text-white/40">Nothing moderated yet.</p> : (
            <div className="space-y-2">{recent.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-[13px]">
                <div className="min-w-0"><span className="font-medium text-white">@{r.username ?? "someone"}</span> <span className="text-white/65">{r.text}</span>
                  <div className="mt-0.5 flex gap-2 text-[11.5px] text-white/40"><Badge tone={r.moderation === "deleted" ? "red" : "yellow"}>{r.moderation ?? "visible again"}</Badge>{r.moderation_reason}<span>· {timeAgo(r.created_at)}</span></div></div>
                {r.moderation === "hidden" && <Button size="sm" variant="ghost" onClick={() => unhide(r)}>Unhide</Button>}
              </div>
            ))}</div>
          )}
        </Card>
      </div>
    </Page>
  );
}
