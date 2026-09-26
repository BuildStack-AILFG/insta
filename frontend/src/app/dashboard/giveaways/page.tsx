"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dice5, Gift, Image as ImageIcon, Send, Trash2, Trophy } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, Field, fmtDateTime, Input, Modal, Page, PageHeader, Select, Spinner, Textarea, Toggle, useUi } from "@/components/ui/kit";
import MediaPicker from "@/components/dashboard/MediaPicker";
import { errorMessage, giveaways as api, instagram, type Giveaway, type GiveawayInput, type IgAccount, type MediaPreview } from "@/lib/api";

export default function GiveawaysPage() {
  const { toast, confirm } = useUi();
  const [list, setList] = useState<Giveaway[] | null>(null);
  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  const [editing, setEditing] = useState<Giveaway | "new" | null>(null);
  const [notifying, setNotifying] = useState<Giveaway | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => { try { setList(await api.list()); } catch (e) { setError(errorMessage(e, "Couldn't load giveaways.")); } }, []);
  useEffect(() => { void load(); instagram.list().then((a) => setAccounts(a.filter((x) => x.status !== "disconnected"))).catch(() => setAccounts([])); }, [load]);

  const draw = async (g: Giveaway) => {
    if (g.status === "drawn" && !(await confirm({ title: "Draw again?", body: "New winners replace the current ones.", confirmLabel: "Draw again" }))) return;
    setBusy(g.id); setError(null);
    try { await api.draw(g.id); toast("Winners picked 🎉"); await load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  };

  const noAccount = accounts !== null && accounts.length === 0;
  return (
    <Page>
      <PageHeader icon={<Gift size={20} />} title="Giveaways" subtitle="Pick fair, random winners from the comments on any post — with entry rules like “tag 2 friends” — then DM the winners."
        actions={!noAccount && <Button onClick={() => setEditing("new")} disabled={!accounts}><Gift size={15} /> New giveaway</Button>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      {noAccount ? (
        <EmptyState icon={<Gift size={22} />} title="Connect Instagram first" body="Giveaways read the comments on your posts." action={<Link href="/dashboard/instagram"><Button>Connect Instagram</Button></Link>} />
      ) : !list ? <Spinner /> : list.length === 0 ? (
        <EmptyState icon={<Gift size={22} />} title="No giveaways yet" body="Post your giveaway, let the comments roll in, then draw winners here in one click." action={<Button onClick={() => setEditing("new")}><Gift size={15} /> Create a giveaway</Button>} />
      ) : (
        <div className="space-y-4">{list.map((g) => (
          <Card key={g.id} className="p-5">
            <div className="flex flex-wrap items-start gap-4">
              {g.media_preview?.thumbnail_url ? <img src={g.media_preview.thumbnail_url} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/[0.06] text-white/40"><ImageIcon size={20} /></div>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-semibold text-white">{g.name}</span><Badge tone={g.status === "drawn" ? "green" : "gray"}>{g.status === "drawn" ? "winners drawn" : "not drawn yet"}</Badge></div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[12px] text-white/50">
                  <span>@{g.account_username}</span>
                  {g.keyword && <Badge>must say “{g.keyword}”</Badge>}
                  {g.min_mentions > 0 && <Badge>tag {g.min_mentions}+ friends</Badge>}
                  {g.unique_users && <Badge>one entry per person</Badge>}
                  <Badge>{g.winners_count} winner{g.winners_count === 1 ? "" : "s"}</Badge>
                </div>
                {g.status === "drawn" && <div className="mt-1 text-[12px] text-white/40">{g.entries_count.toLocaleString()} valid entries from {g.comments_total.toLocaleString()} comments · drawn {fmtDateTime(g.drawn_at)}</div>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" loading={busy === g.id} onClick={() => draw(g)}><Dice5 size={14} /> {g.status === "drawn" ? "Draw again" : "Draw winners"}</Button>
                {g.status !== "drawn" && <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>Edit</Button>}
                <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete “${g.name}”?`, confirmLabel: "Delete", danger: true })) { try { await api.remove(g.id); await load(); } catch (e) { toast(errorMessage(e), "error"); } } }}><Trash2 size={13} /></Button>
              </div>
            </div>
            {g.winners.length > 0 && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5 text-[13px] font-semibold text-white"><Trophy size={14} className="text-amber-300" /> Winners</span>
                  <Button size="sm" variant="ghost" onClick={() => setNotifying(g)}><Send size={13} /> {g.notified_at ? "DM remaining winners" : "DM the winners"}</Button></div>
                <div className="grid gap-2 sm:grid-cols-2">{g.winners.map((w) => (
                  <div key={w.comment_id} className="rounded-lg bg-white/[0.04] px-3 py-2 text-[13px]">
                    <a href={`https://instagram.com/${w.username}`} target="_blank" rel="noreferrer" className="font-semibold text-white hover:underline">@{w.username}</a>
                    {w.notified && <Badge tone="green" className="ml-2">DMed</Badge>}
                    <div className="truncate text-[12px] text-white/50">“{w.text}”</div>
                    {w.error && <div className="text-[11.5px] text-red-300">{w.error}</div>}
                  </div>
                ))}</div>
              </div>
            )}
          </Card>
        ))}</div>
      )}
      {editing && accounts && accounts.length > 0 && <Editor giveaway={editing === "new" ? null : editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Giveaway saved"); void load(); }} />}
      {notifying && <NotifyModal giveaway={notifying} onClose={() => setNotifying(null)} onDone={() => { setNotifying(null); void load(); }} />}
    </Page>
  );
}

function Editor({ giveaway, accounts, onClose, onSaved }: { giveaway: Giveaway | null; accounts: IgAccount[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<GiveawayInput>(() => giveaway ? { ...giveaway } : {
    account_id: accounts[0].id, name: "", media_id: "", media_preview: {}, keyword: "", min_mentions: 0, unique_users: true, exclude_usernames: [], winners_count: 1,
  });
  const [exclude, setExclude] = useState((giveaway?.exclude_usernames ?? []).join(", "));
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const account = accounts.find((a) => a.id === f.account_id) ?? accounts[0];
  const preview = f.media_preview as MediaPreview;
  const set = (p: Partial<GiveawayInput>) => setF((x) => ({ ...x, ...p }));
  const valid = f.name.trim() && f.media_id;

  return (
    <Modal open onClose={onClose} title={giveaway ? "Edit giveaway" : "New giveaway"} width={620}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!valid} onClick={async () => {
        setBusy(true); setErr(null);
        const body = { ...f, name: f.name.trim(), exclude_usernames: exclude.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean) };
        try { if (giveaway) await api.update(giveaway.id, body); else await api.create(body); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      }}>Save</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Diwali giveaway" autoFocus /></Field>
          <Field label="Instagram account"><Select value={f.account_id} onChange={(e) => set({ account_id: e.target.value, media_id: "", media_preview: {} })}>{accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}</Select></Field>
        </div>
        <Field label="Giveaway post">
          <div className="flex items-center gap-3">
            {preview?.thumbnail_url ? <img src={preview.thumbnail_url} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white/[0.06] text-white/35"><ImageIcon size={18} /></div>}
            <div className="min-w-0 flex-1 text-[12.5px] text-white/60">{f.media_id ? (preview?.caption || "Selected post") : "No post chosen yet"}</div>
            <Button variant="ghost" size="sm" onClick={() => setPicker(true)}>{f.media_id ? "Change" : "Choose post"}</Button>
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Comment must include (optional)"><Input value={f.keyword} maxLength={60} onChange={(e) => set({ keyword: e.target.value })} placeholder="e.g. WIN" /></Field>
          <Field label="Friends they must tag"><Input type="number" min={0} max={10} value={f.min_mentions} onChange={(e) => set({ min_mentions: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} /></Field>
          <Field label="Number of winners"><Input type="number" min={1} max={50} value={f.winners_count} onChange={(e) => set({ winners_count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} /></Field>
        </div>
        <label className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] text-white/80">One entry per person, however many times they comment<Toggle checked={f.unique_users} label="One entry per person" onChange={(v) => set({ unique_users: v })} /></label>
        <Field label="Exclude these accounts (optional)" hint="Your own account is always excluded. Separate usernames with commas.">
          <Textarea rows={2} value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="@team.member, @partner.brand" />
        </Field>
      </div>
      {picker && <MediaPicker single account={account} selected={f.media_id ? [preview] : []} onClose={() => setPicker(false)}
        onDone={(sel) => { const m = sel[0]; if (m) set({ media_id: m.id, media_preview: m }); setPicker(false); }} />}
    </Modal>
  );
}

function NotifyModal({ giveaway, onClose, onDone }: { giveaway: Giveaway; onClose: () => void; onDone: () => void }) {
  const { toast } = useUi();
  const [message, setMessage] = useState(giveaway.notify_message || "Congratulations {{username}}! 🎉 You won our giveaway. Reply here to claim your prize.");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="DM the winners" width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!message.trim()} onClick={async () => {
        setBusy(true); setErr(null);
        try { const g = await api.notify(giveaway.id, message.trim()); const ok = g.winners.filter((w) => w.notified).length; toast(`${ok} of ${g.winners.length} winners DMed`); onDone(); }
        catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      }}><Send size={14} /> Send</Button></>}>
      {err && <Alert>{err}</Alert>}
      <Field label="Message" hint="Sent as a private reply to each winning comment. Instagram only allows this within 7 days of the comment, and only once per comment — if a comment automation already DMed them, reply from the inbox instead.">
        <Textarea rows={4} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
    </Modal>
  );
}
