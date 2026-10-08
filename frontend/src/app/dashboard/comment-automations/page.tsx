"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, EyeOff, FlaskConical, Heart, Image as ImageIcon, Lock, Mail, MessageCircle, MessageCircleReply, MousePointerClick, Phone, Plus, Send, Trash2, UserPlus, Workflow, X } from "lucide-react";
import { Alert, Badge, Button, Card, cx, EmptyState, Field, Input, Modal, Page, PageHeader, Select, Spinner, Tabs, Textarea, Toggle, timeAgo, useUi } from "@/components/ui/kit";
import {
  commentAutomations as api, errorMessage, flows as flowsApi, instagram,
  type CommentActivity, type CommentAutomation, type CommentAutomationInput, type FlowSummary, type IgAccount,
} from "@/lib/api";
import MediaPicker from "@/components/dashboard/MediaPicker";
import AiWriteButton from "@/components/dashboard/AiWriteButton";

const OUTCOME: Record<CommentActivity["outcome"], { label: string; tone: "green" | "yellow" | "red" | "gray" | "blue" }> = {
  matched: { label: "Replied", tone: "green" }, no_match: { label: "No match", tone: "gray" }, skipped_repeat: { label: "Already replied", tone: "blue" },
  failed: { label: "Failed", tone: "red" }, pending: { label: "Processing", tone: "yellow" }, moderated: { label: "Moderated", tone: "yellow" },
};

export default function CommentAutomationsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CommentAutomations />
    </Suspense>
  );
}

function CommentAutomations() {
  const { toast, confirm } = useUi();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<"automations" | "activity">("automations");
  const [list, setList] = useState<CommentAutomation[] | null>(null);
  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  const [flowList, setFlowList] = useState<FlowSummary[]>([]);
  const [editing, setEditing] = useState<CommentAutomation | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => { try { setList(await api.list()); } catch (e) { setError(errorMessage(e, "Couldn't load automations.")); } }, []);
  useEffect(() => {
    void load();
    instagram.list().then((a) => setAccounts(a.filter((x) => x.status !== "disconnected"))).catch(() => setAccounts([]));
    flowsApi.list().then((f) => setFlowList(f.filter((x) => x.status === "published"))).catch(() => {});
  }, [load]);
  useEffect(() => {
    if (params.get("new") && accounts?.length) { setEditing("new"); router.replace("/dashboard/comment-automations", { scroll: false }); }
  }, [params, accounts, router]);

  const setStatus = async (a: CommentAutomation, active: boolean) => {
    setList((l) => l!.map((x) => (x.id === a.id ? { ...x, status: active ? "active" : "paused" } : x)));
    try { await api.setStatus(a.id, active ? "active" : "paused"); } catch (e) { toast(errorMessage(e), "error"); void load(); }
  };

  const noAccount = accounts !== null && accounts.length === 0;
  return (
    <Page wide>
      <PageHeader icon={<MessageCircleReply size={20} />} title="Comment → DM"
        subtitle="When someone comments a keyword on your post or reel, reply to the comment and send them a DM automatically — the #1 way to turn comments into leads."
        actions={!noAccount && <Button onClick={() => setEditing("new")} disabled={!accounts}><Plus size={15} /> New automation</Button>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

      {noAccount ? (
        <EmptyState icon={<MessageCircleReply size={22} />} title="Connect Instagram first" body="Comment automations run on your connected Instagram account."
          action={<Link href="/dashboard/instagram"><Button>Connect Instagram</Button></Link>} />
      ) : (
        <>
          <Tabs tabs={[{ id: "automations", label: "Automations", count: list?.length }, { id: "activity", label: "Activity" }]} value={tab} onChange={setTab} />
          {tab === "automations" ? (
            !list ? <Spinner /> : list.length === 0 ? (
              <EmptyState icon={<MessageCircleReply size={22} />} title="No comment automations yet"
                body="Example: people comment “PRICE” on your reel → you reply “Sent you a DM! 💌” under their comment and DM them the price list with a Shop button."
                action={<Button onClick={() => setEditing("new")}><Plus size={15} /> Create your first automation</Button>} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">{list.map((a) => (
                <Card key={a.id} className="flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <PostThumbs a={a} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[15px] font-semibold text-white">{a.name}</span>
                        <Toggle checked={a.status === "active"} label="Active" onChange={(v) => setStatus(a, v)} />
                      </div>
                      <div className="text-[12px] text-white/40">@{a.account_username} · {a.media_scope === "all" ? "All posts & reels" : a.media_scope === "next" ? "Your next post" : a.media_scope === "live" ? "Instagram Live" : `${a.media_ids.length} post${a.media_ids.length === 1 ? "" : "s"}`}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.match_type === "any" ? <Badge tone="yellow">Any comment</Badge> : a.keywords.slice(0, 6).map((k) => <span key={k} className="rounded-md bg-white/10 px-2 py-0.5 text-[12px] text-white">{k}</span>)}
                        {a.match_type === "exact" && <Badge tone="blue">exact</Badge>}
                        {a.flow_id && <Badge tone="green"><Workflow size={10} /> follow-up flow</Badge>}
                        {a.gate !== "none" && <Badge tone="blue"><Lock size={10} /> {GATES[a.gate].short}</Badge>}
                        {a.dm_text_b.trim() && <Badge tone="yellow"><FlaskConical size={10} /> A/B test</Badge>}
                        {a.reminder_enabled && <Badge>{a.stats.reminders_sent} reminders</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    {([["Comments", a.stats.comments_matched], ["DMs sent", a.stats.dms_sent], a.gate !== "none" ? ["Unlocked", a.stats.gates_passed] : ["Replies", a.stats.public_replies_sent], ["Clicked", a.stats.link_clicks]] as [string, number][]).map(([l, v]) => (
                      <div key={l as string} className="rounded-xl bg-white/[0.04] py-2"><div className="text-[18px] font-bold text-white">{(v as number).toLocaleString()}</div><div className="text-[11px] text-white/40">{l}</div></div>
                    ))}
                  </div>
                  {a.dm_text_b.trim() && <AbResults id={a.id} />}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[11.5px] text-white/35">{a.last_triggered_at ? `Last triggered ${timeAgo(a.last_triggered_at)}` : "Not triggered yet"}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button>
                      <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => {
                        if (await confirm({ title: `Delete “${a.name}”?`, body: "Comments on these posts will no longer get automatic replies.", confirmLabel: "Delete", danger: true })) {
                          try { await api.remove(a.id); await load(); } catch (e) { toast(errorMessage(e), "error"); }
                        }
                      }}><Trash2 size={13} /></Button>
                    </div>
                  </div>
                </Card>
              ))}</div>
            )
          ) : <Activity automations={list ?? []} />}
        </>
      )}

      {editing && accounts && accounts.length > 0 && (
        <Editor automation={editing === "new" ? null : editing} accounts={accounts} flows={flowList} onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); toast(msg); void load(); }} />
      )}
    </Page>
  );
}

function PostThumbs({ a }: { a: CommentAutomation }) {
  const thumbs = a.media_preview.filter((m) => m.thumbnail_url).slice(0, 3);
  if (thumbs.length === 0) {
    return <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/40">{a.media_scope === "all" ? <ImageIcon size={20} /> : <Plus size={20} />}</div>;
  }
  return (
    <div className="relative h-14 w-14 shrink-0">
      {thumbs.map((m, i) => <img key={m.id} src={m.thumbnail_url!} alt="" className="absolute h-12 w-12 rounded-lg border-2 border-[var(--background)] object-cover" style={{ left: i * 4, top: i * 4, zIndex: 3 - i }} />)}
    </div>
  );
}

// ---- editor -----------------------------------------------------------------------------------------------------------------------------

const EMPTY = (accountId: string): CommentAutomationInput => ({
  account_id: accountId, name: "", status: "active", media_scope: "specific", media_ids: [], media_preview: [], match_type: "contains", keywords: [], exclude_keywords: [],
  public_reply_enabled: true, public_replies: ["Sent you a DM {{username}}! 💌", "Check your DMs {{username}} ✨"], dm_enabled: true,
  dm_text: "Hey {{username}}! Here's the link you asked for 👇", dm_buttons: [{ title: "Open link", url: "" }], flow_id: null, once_per_user: true,
  gate: "none", gate_prompt: "", gate_button: "", gate_retry_text: "", track_clicks: true, dm_text_b: "",
  reminder_enabled: false, reminder_after_minutes: 120, reminder_text: "",
});

const GATES = {
  none: { short: "", title: "Send it straight away", hint: "The DM goes out as soon as they comment", icon: Send,
    prompt: "", button: "", retry: "" },
  follow: { short: "follow to unlock", title: "Only if they follow you", hint: "They tap a button; we check they follow you first", icon: UserPlus,
    prompt: "Tap below and I'll send it right over 👇", button: "Send me the link", retry: "Almost there! Follow @{account} first, then tap the button again 👇" },
  email: { short: "email to unlock", title: "After they share an email", hint: "Collect a lead before sending the link", icon: Mail,
    prompt: "Drop your email here and I'll send it right away 📩", button: "", retry: "Hmm, that doesn't look like an email — could you check it?" },
  phone: { short: "phone to unlock", title: "After they share a phone number", hint: "For call-backs and WhatsApp follow-ups", icon: Phone,
    prompt: "Share your phone number (with country code) and I'll send it right away 📲", button: "", retry: "Hmm, that doesn't look like a phone number — could you check it?" },
} as const;

const TEMPLATES: { id: string; label: string; apply: Partial<CommentAutomationInput> }[] = [
  { id: "link", label: "Product link", apply: { name: "Product link DM", keywords: ["LINK", "PRICE"], gate: "none", dm_text: "Hey {{username}}! Here's the link 👇", dm_buttons: [{ title: "Shop now", url: "" }] } },
  { id: "follow", label: "Follow to unlock", apply: { name: "Follow to unlock", keywords: ["GUIDE"], gate: "follow", dm_text: "Thanks for following {{username}}! Here's your guide 👇", dm_buttons: [{ title: "Download", url: "" }] } },
  { id: "email", label: "Freebie for email", apply: { name: "Freebie for email", keywords: ["FREE"], gate: "email", dm_text: "Sent! Here's your freebie too {{username}} 🎁", dm_buttons: [{ title: "Get it", url: "" }] } },
  { id: "callback", label: "Call-back request", apply: { name: "Call-back request", keywords: ["DETAILS", "INFO"], gate: "phone", dm_text: "Thanks {{username}}! Our team will call you soon. Meanwhile, here are the details 👇", dm_buttons: [{ title: "View details", url: "" }] } },
];

function Editor({ automation, accounts, flows, onClose, onSaved }: { automation: CommentAutomation | null; accounts: IgAccount[]; flows: FlowSummary[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState<CommentAutomationInput>(() => automation ? { ...automation } : EMPTY(accounts[0].id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const set = (p: Partial<CommentAutomationInput>) => setF((x) => ({ ...x, ...p }));
  const account = accounts.find((a) => a.id === f.account_id) ?? accounts[0];

  const problems = useMemo(() => {
    const out: string[] = [];
    if (!f.name.trim()) out.push("Give the automation a name.");
    if (f.media_scope === "specific" && f.media_ids.length === 0) out.push("Choose at least one post or reel.");
    if (f.match_type !== "any" && f.keywords.length === 0) out.push("Add at least one keyword.");
    if (!f.public_reply_enabled && !f.dm_enabled) out.push("Turn on the public reply, the DM, or both.");
    if (f.public_reply_enabled && f.public_replies.filter((r) => r.trim()).length === 0) out.push("Add a public reply.");
    if (f.dm_enabled && !f.dm_text.trim()) out.push("Write the DM.");
    if (f.dm_enabled && f.dm_buttons.some((b) => (b.title.trim() || b.url.trim()) && (!b.title.trim() || !/^https?:\/\/\S+$/.test(b.url.trim())))) out.push("Every DM button needs a title and a link starting with https://");
    if (f.gate !== "none" && !f.dm_enabled) out.push("Turn the DM on — it's what gets sent once they unlock it.");
    if (f.reminder_enabled && !(f.dm_enabled && f.track_clicks && f.dm_buttons.some((b) => b.title.trim() && b.url.trim()))) out.push("Click reminders need a link button with click tracking on.");
    return out;
  }, [f]);

  const save = async () => {
    setBusy(true); setErr(null);
    const body: CommentAutomationInput = {
      ...f, name: f.name.trim(), public_replies: f.public_replies.map((r) => r.trim()).filter(Boolean),
      dm_buttons: f.dm_buttons.map((b) => ({ title: b.title.trim(), url: b.url.trim() })).filter((b) => b.title && b.url),
    };
    try {
      if (automation) await api.update(automation.id, body); else await api.create(body);
      onSaved(automation ? "Automation updated" : "Automation is live 🎉");
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={automation ? "Edit comment automation" : "New comment automation"} width={1040}
      footer={<><span className="mr-auto text-[12px] text-amber-200/80">{problems[0] ?? ""}</span><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} disabled={problems.length > 0} onClick={save}>{automation ? "Save changes" : f.status === "active" ? "Go live" : "Save as paused"}</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {!automation && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-white/45">Start from a template:</span>
              {TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => set({ ...t.apply, gate_prompt: "", gate_button: "", gate_retry_text: "" })}
                  className={cx("rounded-full border px-3 py-1 text-[12px]", f.name === t.apply.name ? "border-[var(--brand)] text-white" : "border-white/15 text-white/65 hover:text-white")}>{t.label}</button>
              ))}
            </div>
          )}
          <Step n={1} title="Name & account">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name (only you see this)"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Reel: price list DM" autoFocus /></Field>
              <Field label="Instagram account"><Select value={f.account_id} onChange={(e) => set({ account_id: e.target.value, media_ids: [], media_preview: [] })}>{accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}</Select></Field>
            </div>
          </Step>

          <Step n={2} title="Which posts?">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {([["specific", "Specific posts", "Pick posts or reels"], ["next", "My next post", "Arms itself for the next thing you publish"], ["all", "All posts", "Any post or reel, now and later"], ["live", "During Live", "Comments on your Instagram Live"]] as const).map(([v, l, h]) => (
                <Choice key={v} active={f.media_scope === v} onClick={() => set({ media_scope: v })} title={l} hint={h} />
              ))}
            </div>
            {f.media_scope === "specific" && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {f.media_preview.map((m) => (
                    <div key={m.id} className="group relative h-20 w-20 overflow-hidden rounded-lg bg-white/[0.06]">
                      {m.thumbnail_url ? <img src={m.thumbnail_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/30"><ImageIcon size={18} /></div>}
                      <button onClick={() => set({ media_ids: f.media_ids.filter((x) => x !== m.id), media_preview: f.media_preview.filter((x) => x.id !== m.id) })}
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="Remove post"><X size={12} /></button>
                    </div>
                  ))}
                  <button onClick={() => setPicker(true)} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-[11.5px] text-white/50 hover:border-white/40 hover:text-white"><Plus size={16} /> Choose</button>
                </div>
              </div>
            )}
          </Step>

          <Step n={3} title="Which comments?">
            <div className="grid gap-2 sm:grid-cols-3">
              {([["contains", "Contains a keyword", "“price please” matches PRICE"], ["exact", "Is exactly a keyword", "Only a comment that is just “PRICE”"], ["any", "Any comment", "Reply to everyone who comments"]] as const).map(([v, l, h]) => (
                <Choice key={v} active={f.match_type === v} onClick={() => set({ match_type: v })} title={l} hint={h} />
              ))}
            </div>
            {f.match_type !== "any" && <div className="mt-3"><ChipInput label="Keywords" values={f.keywords} onChange={(keywords) => set({ keywords })} placeholder="Type a keyword and press Enter — e.g. PRICE, LINK, INFO" /></div>}
            <details className="mt-3 text-[12.5px] text-white/55">
              <summary className="cursor-pointer select-none">Ignore comments that contain…</summary>
              <div className="mt-2"><ChipInput values={f.exclude_keywords} onChange={(exclude_keywords) => set({ exclude_keywords })} placeholder="e.g. refund, scam" /></div>
            </details>
          </Step>

          <Step n={4} title="Reply under the comment" toggle={<Toggle checked={f.public_reply_enabled} label="Public reply" onChange={(v) => set({ public_reply_enabled: v })} />}>
            {f.public_reply_enabled ? (
              <div className="space-y-2">
                <p className="text-[12px] text-white/45">One of these is picked at random each time, so your replies don&apos;t look robotic. <code>{"{{username}}"}</code> becomes @their_name.</p>
                {f.public_replies.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={r} maxLength={300} onChange={(e) => set({ public_replies: f.public_replies.map((x, j) => (j === i ? e.target.value : x)) })} />
                    {f.public_replies.length > 1 && <button onClick={() => set({ public_replies: f.public_replies.filter((_, j) => j !== i) })} className="rounded-md px-2 text-white/40 hover:bg-white/10 hover:text-white" aria-label="Remove reply"><Trash2 size={14} /></button>}
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  {f.public_replies.length < 10 && <Button size="sm" variant="ghost" onClick={() => set({ public_replies: [...f.public_replies, ""] })}><Plus size={13} /> Add a variation</Button>}
                  <AiWriteButton purpose="public_reply" context={`Comment keywords: ${f.keywords.join(", ")}`} pickLabel="Add this"
                    onPick={(t) => set({ public_replies: [...f.public_replies.filter((r) => r.trim()), t].slice(0, 10) })} />
                </div>
              </div>
            ) : <p className="text-[12.5px] text-white/40">No public reply — the comment only gets a DM.</p>}
          </Step>

          <Step n={5} title="Send them a DM" toggle={<Toggle checked={f.dm_enabled} label="DM" onChange={(v) => set({ dm_enabled: v })} />}>
            {f.dm_enabled ? (
              <div className="space-y-3">
                <div className="-mb-2 flex justify-end"><AiWriteButton purpose="dm" context={`They commented: ${f.keywords.join(", ") || "anything"}`} onPick={(t) => set({ dm_text: t })} /></div>
                <Field label={f.dm_text_b.trim() ? "Message — version A" : "Message"} hint="Instagram allows one private reply per comment, within 7 days of it."><Textarea value={f.dm_text} maxLength={1000} rows={3} onChange={(e) => set({ dm_text: e.target.value })} /></Field>
                <details open={!!f.dm_text_b} className="rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px] text-white/60">
                  <summary className="flex cursor-pointer select-none items-center gap-1.5"><FlaskConical size={13} /> Test a second version (A/B)</summary>
                  <div className="mt-2 space-y-1">
                    <Textarea value={f.dm_text_b} maxLength={1000} rows={3} placeholder="Version B — same buttons, different wording" onChange={(e) => set({ dm_text_b: e.target.value })} />
                    <p className="text-[11.5px] text-white/40">Half of the people get A, half get B (always the same one per person). Compare clicks on the automation card. Leave empty to turn the test off.</p>
                  </div>
                </details>
                <div>
                  <div className="mb-1.5 text-[12.5px] font-medium text-white/70">Link buttons ({f.dm_buttons.length}/3)</div>
                  {f.dm_buttons.map((b, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <Input value={b.title} maxLength={20} placeholder="Button text" className="!w-40" onChange={(e) => set({ dm_buttons: f.dm_buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                      <Input value={b.url} placeholder="https://yourshop.com/…" onChange={(e) => set({ dm_buttons: f.dm_buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                      <button onClick={() => set({ dm_buttons: f.dm_buttons.filter((_, j) => j !== i) })} className="rounded-md px-2 text-white/40 hover:bg-white/10 hover:text-white" aria-label="Remove button"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {f.dm_buttons.length < 3 && <Button size="sm" variant="ghost" onClick={() => set({ dm_buttons: [...f.dm_buttons, { title: "", url: "" }] })}><Plus size={13} /> Add button</Button>}
                  <label className="mt-2 flex items-center gap-2 text-[12.5px] text-white/60">
                    <Toggle checked={f.track_clicks} label="Track clicks" onChange={(v) => set({ track_clicks: v })} />
                    <MousePointerClick size={13} /> Track who clicks the buttons (tags them and counts clicks)
                  </label>
                  {f.track_clicks && f.dm_buttons.length > 0 && (
                    <div className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2">
                      <label className="flex items-center gap-2 text-[12.5px] text-white/70">
                        <Toggle checked={f.reminder_enabled} label="Click reminder" onChange={(v) => set({ reminder_enabled: v })} /> Remind people who didn&apos;t open the link
                      </label>
                      {f.reminder_enabled && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr]">
                          <Field label="After (minutes)"><Input type="number" min={5} max={1380} value={f.reminder_after_minutes} onChange={(e) => set({ reminder_after_minutes: Math.max(5, Math.min(1380, Number(e.target.value) || 120)) })} /></Field>
                          <Field label="Reminder" hint="Sent once, with the same buttons — only if their 24h reply window is open (they replied or passed an unlock step)."><Input value={f.reminder_text} maxLength={640} placeholder="Did you grab it? 👀" onChange={(e) => set({ reminder_text: e.target.value })} /></Field>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Field label="When they reply to the DM, continue in a flow (optional)" hint={flows.length ? "Great for collecting an email or phone number before sharing the link." : "Publish a flow to use it here."}>
                  <Select value={f.flow_id ?? ""} onChange={(e) => set({ flow_id: e.target.value || null })}><option value="">No follow-up flow</option>{flows.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}</Select>
                </Field>
              </div>
            ) : <p className="text-[12.5px] text-white/40">No DM — only the public reply is posted.</p>}
          </Step>

          {f.dm_enabled && (
            <Step n={6} title="When should they get the link?">
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(GATES) as (keyof typeof GATES)[]).map((g) => (
                  <Choice key={g} active={f.gate === g} onClick={() => set({ gate: g })} title={GATES[g].title} hint={GATES[g].hint} />
                ))}
              </div>
              {f.gate !== "none" && (
                <div className="mt-3 space-y-3">
                  <Field label="First DM (sent as the reply to their comment)" hint={f.gate === "follow" ? "It comes with a button; tapping it checks that they follow you." : "Their next message is checked; a valid answer is saved on the contact and tagged lead."}>
                    <Textarea rows={2} maxLength={640} value={f.gate_prompt} placeholder={GATES[f.gate].prompt} onChange={(e) => set({ gate_prompt: e.target.value })} />
                  </Field>
                  {f.gate === "follow" && <Field label="Button text"><Input maxLength={20} value={f.gate_button} placeholder={GATES.follow.button} onChange={(e) => set({ gate_button: e.target.value })} className="max-w-xs" /></Field>}
                  <Field label={f.gate === "follow" ? "If they don't follow you yet" : "If the answer doesn't look right"} hint={f.gate === "follow" ? "{account} becomes your @username. A button to your profile is added automatically." : "After three wrong answers we stop asking and your normal replies take over."}>
                    <Textarea rows={2} maxLength={640} value={f.gate_retry_text} placeholder={GATES[f.gate].retry} onChange={(e) => set({ gate_retry_text: e.target.value })} />
                  </Field>
                  <p className="text-[12px] text-white/45">Once they pass, they get the DM from step 5 with its buttons.</p>
                </div>
              )}
            </Step>
          )}

          <label className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 text-[13px] text-white/80">
            <span>Only reply once per person<span className="block text-[11.5px] text-white/40">People often comment the keyword several times — they&apos;ll only get one DM.</span></span>
            <Toggle checked={f.once_per_user} label="Once per person" onChange={(v) => set({ once_per_user: v })} />
          </label>
        </div>

        <Preview f={f} username={account.username} avatar={account.profile_picture_url} />
      </div>

      {picker && <MediaPicker account={account} selected={f.media_preview} onClose={() => setPicker(false)}
        onDone={(sel) => { set({ media_ids: sel.map((m) => m.id), media_preview: sel }); setPicker(false); }} />}
    </Modal>
  );
}

function Step({ n, title, toggle, children }: { n: number; title: string; toggle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white btn-accent" style={{ background: "var(--brand)" }}>{n}</span><span className="text-[14.5px] font-semibold text-white">{title}</span></div>
        {toggle}
      </div>
      {children}
    </section>
  );
}

function Choice({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button onClick={onClick} className={cx("rounded-xl border p-3 text-left transition", active ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")}>
      <div className="flex items-center justify-between text-[13px] font-semibold text-white">{title}{active && <Check size={14} className="text-brand-bright" />}</div>
      <div className="mt-0.5 text-[11.5px] text-white/45">{hint}</div>
    </button>
  );
}

function ChipInput({ label, values, onChange, placeholder }: { label?: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(",").map((t) => t.trim()).filter(Boolean);
    const next = [...values];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 60));
    onChange(next.slice(0, 50));
    setText("");
  };
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
        {values.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[12.5px] text-white">{v}<button onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-white/40 hover:text-white"><X size={11} /></button></span>)}
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() && add()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1)); }}
          placeholder={values.length ? "" : placeholder} className="min-w-[160px] flex-1 bg-transparent py-1 text-[13px] text-white placeholder:text-white/30 focus:outline-none" />
      </div>
    </Field>
  );
}

function Preview({ f, username, avatar }: { f: CommentAutomationInput; username: string; avatar: string | null }) {
  const who = "@priya.styles";
  const render = (t: string) => t.replace(/\{\{\s*username\s*\}\}/g, who);
  const comment = f.match_type === "any" ? "Love this! 😍" : `${f.keywords[0] ?? "PRICE"} please`;
  const reply = f.public_replies.find((r) => r.trim());
  const buttons = f.dm_buttons.filter((b) => b.title.trim());
  return (
    <div className="lg:sticky lg:top-0">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">Preview</div>
      <div className="rounded-[28px] border border-white/10 bg-black/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-[12px] text-white/50"><MessageCircle size={13} /> Comments</div>
        <div className="flex gap-2">
          <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-pink-500 to-orange-400" />
          <div className="text-[12.5px] text-white"><b>priya.styles</b> {comment}<div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/40">1m <Heart size={10} /></div></div>
        </div>
        {f.public_reply_enabled && reply && (
          <div className="ml-9 mt-2 flex gap-2">
            {avatar ? <img src={avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" /> : <div className="h-6 w-6 shrink-0 rounded-full bg-white/20" />}
            <div className="text-[12.5px] text-white"><b>{username}</b> {render(reply)}</div>
          </div>
        )}
        {f.dm_enabled && f.dm_text.trim() && (
          <>
            <div className="my-4 flex items-center gap-2 text-[12px] text-white/50"><Send size={13} /> Their DMs</div>
            {f.gate !== "none" && (
              <div className="mb-2 space-y-2">
                <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-white/[0.1] px-3 py-2 text-[12.5px] text-white">
                  <div className="whitespace-pre-wrap">{render(f.gate_prompt || GATES[f.gate].prompt)}</div>
                  {f.gate === "follow" && <div className="mt-1.5 rounded-lg bg-black/30 py-1.5 text-center text-[12px] font-medium">{f.gate_button || GATES.follow.button}</div>}
                </div>
                <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-md bg-[#9d174d] px-3 py-2 text-[12.5px] text-white">
                  {f.gate === "follow" ? `👆 taps “${f.gate_button || GATES.follow.button}” (and follows you)` : f.gate === "email" ? "priya@mail.com" : "+91 98765 43210"}
                </div>
              </div>
            )}
            <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-white/[0.1] px-3 py-2 text-[12.5px] text-white">
              <div className="whitespace-pre-wrap">{render(f.dm_text)}</div>
              {buttons.map((b, i) => <div key={i} className="mt-1.5 rounded-lg bg-black/30 py-1.5 text-center text-[12px] font-medium">{b.title}</div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- activity -----------------------------------------------------------------------------------------------------------------------------

function Activity({ automations }: { automations: CommentAutomation[] }) {
  const [rows, setRows] = useState<CommentActivity[] | null>(null);
  const [total, setTotal] = useState(0);
  const [automationId, setAutomationId] = useState("");
  const [outcome, setOutcome] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    api.activity({ automation_id: automationId || undefined, outcome: outcome || undefined, limit: 100 })
      .then((r) => { setRows(r.items); setTotal(r.total); }).catch((e) => setErr(errorMessage(e)));
  }, [automationId, outcome]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={automationId} onChange={(e) => setAutomationId(e.target.value)} className="!w-56" aria-label="Automation"><option value="">All automations</option>{automations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="!w-44" aria-label="Outcome"><option value="">Every outcome</option>{Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
      </div>
      {err && <Alert>{err}</Alert>}
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={<MessageCircle size={22} />} title="No comments yet" body="Every comment on your posts shows up here with what the automation did about it." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-white/10 text-[11.5px] uppercase tracking-wide text-white/40"><tr><th className="px-4 py-2.5">Comment</th><th className="px-4 py-2.5">Automation</th><th className="px-4 py-2.5">Result</th><th className="px-4 py-2.5 text-right">When</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b border-white/5 align-top">
                <td className="max-w-[360px] px-4 py-2.5"><span className="font-medium text-white">@{r.username ?? "someone"}</span> <span className="text-white/70">{r.text}</span>{r.is_live && <Badge className="ml-2" tone="red">LIVE</Badge>}</td>
                <td className="px-4 py-2.5 text-white/60">{r.automation?.name ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge>
                  {r.outcome === "matched" && <span className="ml-2 text-[11.5px] text-white/45">{[r.public_reply && "replied", r.dm_sent && "DMed"].filter(Boolean).join(" · ")}</span>}
                  {r.moderation && <span className="ml-2 text-[11.5px] text-amber-200/80">{r.moderation}{r.moderation_reason ? ` · ${r.moderation_reason}` : ""}</span>}
                  {r.error && <div className="mt-1 text-[11.5px] text-red-300">{r.error}</div>}
                  {r.moderation !== "deleted" && <ModerateButtons row={r} onDone={(m) => setRows((rs) => rs!.map((x) => (x.id === r.id ? { ...x, ...m } : x)))} />}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-white/40">{timeAgo(r.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {total > rows.length && <div className="p-3 text-center text-[12px] text-white/35">Showing the latest {rows.length} of {total}.</div>}
        </Card>
      )}
    </div>
  );
}


function AbResults({ id }: { id: string }) {
  const [r, setR] = useState<Awaited<ReturnType<typeof api.variants>> | null>(null);
  useEffect(() => { api.variants(id).then(setR).catch(() => {}); }, [id]);
  if (!r) return null;
  const winner = r.A.sent && r.B.sent ? (r.A.click_rate === r.B.click_rate ? null : r.A.click_rate > r.B.click_rate ? "A" : "B") : null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
      {(["A", "B"] as const).map((v) => (
        <div key={v} className={cx("rounded-lg border px-3 py-1.5", winner === v ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]" : "border-white/10")}>
          <span className="font-semibold text-white">Version {v}</span> <span className="text-white/50">· {r[v].sent} sent · {r[v].clicked} clicked · <b className="text-white/80">{r[v].click_rate}%</b></span>
        </div>
      ))}
    </div>
  );
}

function ModerateButtons({ row, onDone }: { row: CommentActivity; onDone: (m: Pick<CommentActivity, "moderation" | "moderation_reason">) => void }) {
  const { toast, confirm } = useUi();
  const act = async (action: "hide" | "unhide" | "delete") => {
    if (action === "delete" && !(await confirm({ title: "Delete this comment on Instagram?", body: "This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
    try { onDone(await api.moderate(row.id, action)); toast(action === "unhide" ? "Comment visible again" : action === "hide" ? "Comment hidden" : "Comment deleted"); }
    catch (e) { toast(errorMessage(e), "error"); }
  };
  return (
    <div className="mt-1 flex gap-2 text-[11.5px]">
      {row.moderation === "hidden"
        ? <button onClick={() => act("unhide")} className="text-sky-300 hover:underline">Unhide</button>
        : <button onClick={() => act("hide")} className="flex items-center gap-1 text-white/45 hover:text-white"><EyeOff size={11} /> Hide</button>}
      <button onClick={() => act("delete")} className="text-white/45 hover:text-red-300">Delete</button>
    </div>
  );
}
