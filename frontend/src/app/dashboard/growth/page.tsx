"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Link2, Plus, QrCode, Rocket, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, CopyField, EmptyState, Field, Input, Modal, Page, PageHeader, Select, Spinner, Tabs, Textarea, Toggle, timeAgo, useUi } from "@/components/ui/kit";
import AiWriteButton from "@/components/dashboard/AiWriteButton";
import {
  errorMessage, flows as flowsApi, growth, instagram,
  type BioPage, type BioPageInput, type FlowSummary, type IgAccount, type RefLink, type RefLinkInput,
} from "@/lib/api";

export default function GrowthPage() {
  const [tab, setTab] = useState<"links" | "bio">("links");
  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  useEffect(() => { instagram.list().then((a) => setAccounts(a.filter((x) => x.status !== "disconnected"))).catch(() => setAccounts([])); }, []);

  return (
    <Page>
      <PageHeader icon={<Rocket size={20} />} title="Growth tools" subtitle="Bring people into your DMs from anywhere — ig.me links and QR codes that start a conversation, and a link-in-bio page." />
      {accounts && accounts.length === 0 ? (
        <EmptyState icon={<Rocket size={22} />} title="Connect Instagram first" body="Growth tools send people to your connected account." action={<Link href="/dashboard/instagram"><Button>Connect Instagram</Button></Link>} />
      ) : !accounts ? <Spinner /> : (
        <>
          <Tabs tabs={[{ id: "links", label: "DM links & QR codes" }, { id: "bio", label: "Link in bio" }]} value={tab} onChange={setTab} />
          {tab === "links" ? <RefLinks accounts={accounts} /> : <BioPages accounts={accounts} />}
        </>
      )}
    </Page>
  );
}

// ---- ref links ------------------------------------------------------------------------------------------------------

function RefLinks({ accounts }: { accounts: IgAccount[] }) {
  const { toast, confirm } = useUi();
  const [list, setList] = useState<RefLink[] | null>(null);
  const [flowList, setFlowList] = useState<FlowSummary[]>([]);
  const [editing, setEditing] = useState<RefLink | "new" | null>(null);
  const [qr, setQr] = useState<RefLink | null>(null);
  const load = useCallback(async () => { try { setList(await growth.refLinks()); } catch (e) { toast(errorMessage(e), "error"); } }, [toast]);
  useEffect(() => { void load(); flowsApi.list().then((f) => setFlowList(f.filter((x) => x.status === "published"))).catch(() => {}); }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-white/50">Put a link in your bio, a story sticker or an ad — or print its QR code on packaging, menus and posters. Opening it starts a DM and sends your welcome.</p>
        <Button onClick={() => setEditing("new")}><Plus size={15} /> New link</Button>
      </div>
      {!list ? <Spinner /> : list.length === 0 ? (
        <EmptyState icon={<QrCode size={22} />} title="No DM links yet" body="Example: a QR code on your shop counter that opens a DM and sends today's offer." action={<Button onClick={() => setEditing("new")}><Plus size={15} /> Create a link</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{list.map((l) => (
          <Card key={l.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-[15px] font-semibold text-white">{l.name}</span>{!l.enabled && <Badge>off</Badge>}</div>
                <div className="truncate text-[12px] text-white/45">@{l.account_username} · ref “{l.ref}”{l.tag && ` · tags ${l.tag}`}</div></div>
              <button onClick={() => setQr(l)} className="shrink-0 rounded-lg bg-white p-1" title="QR code"><img src={l.qr_url} alt="QR code" className="h-14 w-14" /></button>
            </div>
            <div className="mt-3"><CopyField value={l.url} /></div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-white/[0.04] py-2"><div className="text-[18px] font-bold text-white">{l.opens.toLocaleString()}</div><div className="text-[11px] text-white/40">opens</div></div>
              <div className="rounded-xl bg-white/[0.04] py-2"><div className="text-[18px] font-bold text-white">{l.people.toLocaleString()}</div><div className="text-[11px] text-white/40">people</div></div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11.5px] text-white/35">{l.last_opened_at ? `Last opened ${timeAgo(l.last_opened_at)}` : "Not opened yet"}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(l)}>Edit</Button>
                <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete “${l.name}”?`, body: "The link and its QR code keep opening your DMs, but no welcome is sent.", confirmLabel: "Delete", danger: true })) { try { await growth.removeRefLink(l.id); await load(); } catch (e) { toast(errorMessage(e), "error"); } } }}><Trash2 size={13} /></Button>
              </div>
            </div>
          </Card>
        ))}</div>
      )}
      {editing && <RefEditor link={editing === "new" ? null : editing} accounts={accounts} flows={flowList} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Link saved"); void load(); }} />}
      {qr && (
        <Modal open onClose={() => setQr(null)} title={`QR code · ${qr.name}`} width={420}
          footer={<a href={qr.qr_url} download={`${qr.ref}-qr.svg`} target="_blank" rel="noreferrer"><Button><Download size={14} /> Download SVG</Button></a>}>
          <div className="flex flex-col items-center gap-3"><div className="rounded-2xl bg-white p-4"><img src={qr.qr_url} alt="QR code" className="h-64 w-64" /></div>
            <p className="text-center text-[12.5px] text-white/50">Scanning opens a DM with @{qr.account_username}. Print it big enough — at least 2.5 cm wide.</p></div>
        </Modal>
      )}
    </div>
  );
}

function RefEditor({ link, accounts, flows, onClose, onSaved }: { link: RefLink | null; accounts: IgAccount[]; flows: FlowSummary[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<RefLinkInput>(() => link ? { ...link } : { account_id: accounts[0].id, name: "", ref: "", enabled: true, message: "", buttons: [], tag: "", flow_id: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<RefLinkInput>) => setF((x) => ({ ...x, ...p }));
  const account = accounts.find((a) => a.id === f.account_id) ?? accounts[0];
  return (
    <Modal open onClose={onClose} title={link ? "Edit DM link" : "New DM link"} width={620}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!f.name.trim() || !f.ref.trim()} onClick={async () => {
        setBusy(true); setErr(null);
        const body = { ...f, buttons: f.buttons.filter((b) => b.title.trim() && b.url.trim()) };
        try { if (link) await growth.updateRefLink(link.id, body); else await growth.createRefLink(body); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      }}>Save</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={f.name} onChange={(e) => set({ name: e.target.value, ref: link || f.ref ? f.ref : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) })} placeholder="Shop counter QR" autoFocus /></Field>
          <Field label="Account"><Select value={f.account_id} onChange={(e) => set({ account_id: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}</Select></Field>
        </div>
        <Field label="Ref code" hint={`Link: ig.me/m/${account.username}?ref=${f.ref || "…"}`}><Input value={f.ref} maxLength={60} onChange={(e) => set({ ref: e.target.value.replace(/[^A-Za-z0-9_-]/g, "") })} placeholder="shop-counter" /></Field>
        <div>
          <div className="mb-1 flex items-center justify-between"><span className="text-[12.5px] font-medium text-white/70">Welcome message</span><AiWriteButton purpose="dm" context="Welcome message for someone who just opened a DM from our link / QR code" onPick={(t) => set({ message: t })} /></div>
          <Textarea rows={3} maxLength={1000} value={f.message} onChange={(e) => set({ message: e.target.value })} placeholder="Hi {{first_name}}! 👋 Here's today's offer…" />
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-white/70">Link buttons ({f.buttons.length}/3)</div>
          {f.buttons.map((b, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <Input value={b.title} maxLength={20} placeholder="Button text" className="!w-40" onChange={(e) => set({ buttons: f.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <Input value={b.url} placeholder="https://…" onChange={(e) => set({ buttons: f.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button onClick={() => set({ buttons: f.buttons.filter((_, j) => j !== i) })} className="rounded-md px-2 text-white/40 hover:bg-white/10 hover:text-white" aria-label="Remove"><Trash2 size={14} /></button>
            </div>
          ))}
          {f.buttons.length < 3 && <Button size="sm" variant="ghost" onClick={() => set({ buttons: [...f.buttons, { title: "", url: "" }] })}><Plus size={13} /> Add button</Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tag them as (optional)"><Input value={f.tag} maxLength={50} onChange={(e) => set({ tag: e.target.value })} placeholder="walk-in" /></Field>
          <Field label="Then run a flow (optional)"><Select value={f.flow_id ?? ""} onChange={(e) => set({ flow_id: e.target.value || null })}><option value="">No flow</option>{flows.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}</Select></Field>
        </div>
        <label className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] text-white/80">Active<Toggle checked={f.enabled} label="Active" onChange={(v) => set({ enabled: v })} /></label>
      </div>
    </Modal>
  );
}

// ---- link in bio --------------------------------------------------------------------------------------------------------

function BioPages({ accounts }: { accounts: IgAccount[] }) {
  const { toast } = useUi();
  const [pages, setPages] = useState<BioPage[] | null>(null);
  const [refs, setRefs] = useState<RefLink[]>([]);
  const [editing, setEditing] = useState<BioPage | "new" | null>(null);
  const load = useCallback(async () => { try { setPages(await growth.bioPages()); } catch (e) { toast(errorMessage(e), "error"); } }, [toast]);
  useEffect(() => { void load(); growth.refLinks().then(setRefs).catch(() => {}); }, [load]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-white/50">One link for your Instagram bio with all your links and a “DM us” button. Every view and click is counted.</p>
        <Button onClick={() => setEditing("new")}><Plus size={15} /> New page</Button>
      </div>
      {!pages ? <Spinner /> : pages.length === 0 ? (
        <EmptyState icon={<Link2 size={22} />} title="No bio page yet" body="Create a page, then paste its link into your Instagram bio." action={<Button onClick={() => setEditing("new")}><Plus size={15} /> Create page</Button>} />
      ) : (
        <div className="space-y-4">{pages.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><span className="text-[15px] font-semibold text-white">{p.title || `@${p.account_username}`}</span>{!p.published && <Badge>unpublished</Badge>}</div>
                <div className="text-[12px] text-white/45">{p.views.toLocaleString()} views · {p.links.reduce((t, l) => t + (l.clicks ?? 0), 0).toLocaleString()} clicks</div></div>
              <div className="flex gap-2">
                <a href={`/b/${p.slug}`} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink size={13} /> Open</Button></a>
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
              </div>
            </div>
            <div className="mt-3"><CopyField label="Paste this in your Instagram bio" value={`${origin}/b/${p.slug}`} /></div>
            {p.links.length > 0 && <div className="mt-3 space-y-1">{p.links.map((l, i) => <div key={i} className="flex justify-between rounded-lg bg-white/[0.04] px-3 py-1.5 text-[12.5px]"><span className="text-white/80">{l.title}</span><span className="text-white/45">{(l.clicks ?? 0).toLocaleString()} clicks</span></div>)}</div>}
          </Card>
        ))}</div>
      )}
      {editing && <BioEditor page={editing === "new" ? null : editing} accounts={accounts} refs={refs} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Page saved"); void load(); }} />}
    </div>
  );
}

function BioEditor({ page, accounts, refs, onClose, onSaved }: { page: BioPage | null; accounts: IgAccount[]; refs: RefLink[]; onClose: () => void; onSaved: () => void }) {
  const { confirm, toast } = useUi();
  const [f, setF] = useState<BioPageInput>(() => page ? { ...page } : { account_id: accounts[0].id, slug: accounts[0].username.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40), title: accounts[0].name ?? "", bio: "", links: [{ title: "", url: "" }], dm_button_text: "DM us", dm_ref_link_id: null, published: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<BioPageInput>) => setF((x) => ({ ...x, ...p }));
  const account = accounts.find((a) => a.id === f.account_id) ?? accounts[0];
  const accountRefs = refs.filter((r) => r.account_id === f.account_id);

  return (
    <Modal open onClose={onClose} title={page ? "Edit bio page" : "New bio page"} width={880}
      footer={<>{page && <Button variant="danger" className="mr-auto" onClick={async () => { if (await confirm({ title: "Delete this page?", body: "The link in your bio will stop working.", confirmLabel: "Delete", danger: true })) { try { await growth.removeBioPage(page.id); onSaved(); } catch (e) { toast(errorMessage(e), "error"); } } }}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={f.slug.trim().length < 3} onClick={async () => {
          setBusy(true); setErr(null);
          const body = { ...f, links: f.links.filter((l) => l.title.trim() && l.url.trim()).map(({ title, url }) => ({ title, url })) };
          try { if (page) await growth.updateBioPage(page.id, body); else await growth.createBioPage(body); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
        }}>Save</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Account"><Select value={f.account_id} onChange={(e) => set({ account_id: e.target.value, dm_ref_link_id: null })}>{accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}</Select></Field>
            <Field label="Page address" hint={`/b/${f.slug || "…"}`}><Input value={f.slug} maxLength={40} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></Field>
          </div>
          <Field label="Title"><Input value={f.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} placeholder={account.name ?? account.username} /></Field>
          <Field label="Short bio"><Textarea rows={2} maxLength={500} value={f.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="Skincare that actually works ✨" /></Field>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-white/70">Links ({f.links.length}/20)</div>
            {f.links.map((l, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <Input value={l.title} maxLength={80} placeholder="Shop the new drop" className="!w-52" onChange={(e) => set({ links: f.links.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <Input value={l.url} placeholder="https://…" onChange={(e) => set({ links: f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                <button onClick={() => set({ links: f.links.filter((_, j) => j !== i) })} className="rounded-md px-2 text-white/40 hover:bg-white/10 hover:text-white" aria-label="Remove"><Trash2 size={14} /></button>
              </div>
            ))}
            {f.links.length < 20 && <Button size="sm" variant="ghost" onClick={() => set({ links: [...f.links, { title: "", url: "" }] })}><Plus size={13} /> Add link</Button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="“DM us” button text (empty = hide)"><Input value={f.dm_button_text} maxLength={40} onChange={(e) => set({ dm_button_text: e.target.value })} /></Field>
            <Field label="Opens this DM link" hint="Pick a DM link to send its welcome automatically."><Select value={f.dm_ref_link_id ?? ""} onChange={(e) => set({ dm_ref_link_id: e.target.value || null })}><option value="">Plain DM (no welcome)</option>{accountRefs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          </div>
          <label className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] text-white/80">Published<Toggle checked={f.published} label="Published" onChange={(v) => set({ published: v })} /></label>
        </div>
        <div className="theme-fixed rounded-[28px] bg-gradient-to-b from-[#2a0a1c] via-black to-[#1a0610] p-5 text-center text-white">
          {account.profile_picture_url ? <img src={account.profile_picture_url} alt="" className="mx-auto h-16 w-16 rounded-full object-cover ring-2 ring-pink-500" /> : <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-pink-500 to-orange-400" />}
          <div className="mt-2 text-[15px] font-bold">{f.title || account.name || account.username}</div>
          <div className="text-[11.5px] text-white/50">@{account.username}</div>
          {f.bio && <p className="mt-2 text-[12px] text-white/70">{f.bio}</p>}
          <div className="mt-4 space-y-2">
            {f.dm_button_text && <div className="rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-600 py-2 text-[12.5px] font-semibold">{f.dm_button_text}</div>}
            {f.links.filter((l) => l.title.trim()).map((l, i) => <div key={i} className="rounded-xl border border-white/15 bg-white/[0.06] py-2 text-[12.5px]">{l.title}</div>)}
          </div>
        </div>
      </div>
    </Modal>
  );
}
