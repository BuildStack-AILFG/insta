"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Plus, RefreshCw, Sparkles, Trash2, Unplug, UserRound } from "lucide-react";
import { Alert, Badge, Button, Card, CopyField, EmptyState, Field, fmtDateTime, Input, Modal, Page, PageHeader, Spinner, Textarea, Toggle, timeAgo, useUi } from "@/components/ui/kit";
import { InstagramIcon } from "@/components/icons/BrandIcons";
import { useWorkspace } from "@/components/dashboard/WorkspaceContext";
import { errorMessage, instagram, type IgAccount, type IgConfig, type IgSetup } from "@/lib/api";

export default function InstagramPage() {
  const { toast } = useUi();
  const { role } = useWorkspace();
  const canManage = role === "owner" || role === "admin";
  const [accounts, setAccounts] = useState<IgAccount[] | null>(null);
  const [config, setConfig] = useState<IgConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const load = useCallback(async () => {
    try { setAccounts(await instagram.list()); } catch (e) { setError(errorMessage(e, "Couldn't load your Instagram accounts.")); }
  }, []);
  useEffect(() => { void load(); instagram.config().then(setConfig).catch(() => {}); }, [load]);

  const connectOauth = async () => {
    setConnecting(true);
    setError(null);
    try {
      const { url } = await instagram.oauthUrl();
      window.location.href = url;
    } catch (e) {
      setError(errorMessage(e));
      setConnecting(false);
    }
  };

  const live = (accounts ?? []).filter((a) => a.status !== "disconnected");
  const connectButtons = canManage && (
    <div className="flex flex-wrap gap-2">
      {config?.oauth_enabled && <Button onClick={connectOauth} loading={connecting}><InstagramIcon size={15} /> Connect with Instagram</Button>}
      <Button variant={config?.oauth_enabled ? "ghost" : "primary"} onClick={() => setShowToken(true)}><KeyRound size={14} /> Use an access token</Button>
    </div>
  );

  return (
    <Page>
      <PageHeader icon={<InstagramIcon size={20} />} title="Instagram" subtitle="Connect your Instagram Business or Creator account. Comments, DMs, story replies and mentions arrive here in real time."
        actions={live.length > 0 ? connectButtons : undefined} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

      {!accounts ? <Spinner /> : live.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={<InstagramIcon size={22} />} title="Connect your Instagram account"
            body="You'll log in with Instagram and approve access to messages and comments. Only Professional accounts (Business or Creator) can be connected — switch in the Instagram app under Settings → Account type."
            action={connectButtons || undefined} />
          {config && !config.oauth_enabled && (
            <p className="mx-auto mt-4 max-w-lg text-center text-[12.5px] text-white/45">One-click “Connect with Instagram” is temporarily unavailable. You can still connect with an access token, or contact support.</p>
          )}
        </Card>
      ) : (
        <div className="space-y-4">{live.map((a) => <AccountCard key={a.id} account={a} canManage={canManage} onChanged={load} onToast={toast} />)}</div>
      )}

      {accounts?.some((a) => a.status === "disconnected") && (
        <p className="mt-4 text-[12.5px] text-white/40">Disconnected: {accounts.filter((a) => a.status === "disconnected").map((a) => `@${a.username}`).join(", ")} — connect again to resume their automations. Their conversation history is kept.</p>
      )}

      {config?.setup && <SetupGuide setup={config.setup} />}
      <TokenModal open={showToken} onClose={() => setShowToken(false)} onConnected={(a) => { setShowToken(false); toast(`@${a.username} connected`); (a.warnings ?? []).forEach((w) => toast(w, "error")); void load(); }} />
    </Page>
  );
}

function AccountCard({ account: a, canManage, onChanged, onToast }: { account: IgAccount; canManage: boolean; onChanged: () => void; onToast: (m: string, t?: "error") => void }) {
  const { confirm } = useUi();
  const [busy, setBusy] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const expiresSoon = a.token_expires_at && new Date(a.token_expires_at).getTime() - now < 7 * 86400_000;

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) onToast(ok); onChanged(); } catch (e) { onToast(errorMessage(e), "error"); } finally { setBusy(null); }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-4">
        {a.profile_picture_url ? <img src={a.profile_picture_url} alt="" className="h-14 w-14 rounded-full object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10"><UserRound size={22} /></div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`https://instagram.com/${a.username}`} target="_blank" rel="noreferrer" className="text-[16px] font-semibold text-white hover:underline">@{a.username}</a>
            <Badge tone={a.status === "connected" ? "green" : "red"}>{a.status}</Badge>
            {a.account_type && <Badge>{a.account_type === "MEDIA_CREATOR" ? "Creator" : "Business"}</Badge>}
          </div>
          <div className="mt-0.5 text-[12.5px] text-white/50">{a.name}{a.followers_count != null && ` · ${a.followers_count.toLocaleString()} followers`}{a.media_count != null && ` · ${a.media_count.toLocaleString()} posts`}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <span className={a.webhooks_subscribed ? "text-brand-bright" : "text-amber-300"}>{a.webhooks_subscribed ? <><CheckCircle2 size={12} className="mr-1 inline" />Receiving comments &amp; DMs</> : <><AlertTriangle size={12} className="mr-1 inline" />Webhooks not switched on — click Refresh</>}</span>
            <span className="text-white/40">Last event {a.last_webhook_at ? timeAgo(a.last_webhook_at) : "never"}</span>
            {a.token_expires_at && <span className={expiresSoon ? "text-amber-300" : "text-white/40"}>Access renews automatically · expires {fmtDateTime(a.token_expires_at)}</span>}
          </div>
          {a.last_error && <div className="mt-2"><Alert>{a.last_error}</Alert></div>}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" loading={busy === "refresh"} onClick={() => run("refresh", () => instagram.refresh(a.id), "Refreshed")}><RefreshCw size={13} /> Refresh</Button>
            <Button size="sm" variant="danger" loading={busy === "disconnect"} onClick={async () => {
              if (await confirm({ title: `Disconnect @${a.username}?`, body: "Comment automations and DM replies stop for this account. Conversation history is kept.", confirmLabel: "Disconnect", danger: true })) {
                await run("disconnect", () => instagram.disconnect(a.id), "Disconnected");
              }
            }}><Unplug size={13} /></Button>
          </div>
        )}
      </div>
      {canManage && a.status !== "disconnected" && (
        <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 lg:grid-cols-2">
          <IceBreakers account={a} onSaved={onChanged} onToast={onToast} />
          <div>
            <div className="mb-1 text-[13.5px] font-semibold text-white">Human agent replies</div>
            <p className="mb-3 text-[12.5px] text-white/50">Instagram only allows replies within 24 hours of someone&apos;s last message. With the Human Agent permission approved for your Meta app, your team can keep replying for up to 7 days.</p>
            <label className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] text-white/80">
              Allow 7-day human replies
              <Toggle checked={a.human_agent_tag} label="Human agent tag" onChange={(v) => run("ha", () => instagram.update(a.id, { human_agent_tag: v }), v ? "Human agent replies on" : "Human agent replies off")} />
            </label>
          </div>
        </div>
      )}
    </Card>
  );
}

function IceBreakers({ account, onSaved, onToast }: { account: IgAccount; onSaved: () => void; onToast: (m: string, t?: "error") => void }) {
  const [items, setItems] = useState(account.ice_breakers.map((i) => i.question));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(items.filter((x) => x.trim())) !== JSON.stringify(account.ice_breakers.map((i) => i.question));
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[13.5px] font-semibold text-white"><Sparkles size={14} className="text-brand-bright" /> Ice breakers</div>
      <p className="mb-3 text-[12.5px] text-white/50">Up to 4 questions people can tap when they open a chat with you. Answer them with a Keyword reply or a flow that uses the same text.</p>
      <div className="space-y-2">
        {items.map((q, i) => (
          <div key={i} className="flex gap-2">
            <Input value={q} maxLength={80} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder="e.g. What are your prices?" />
            <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="rounded-md px-2 text-white/40 hover:bg-white/10 hover:text-white" aria-label="Remove question"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {items.length < 4 && <Button size="sm" variant="ghost" onClick={() => setItems([...items, ""])}><Plus size={13} /> Add question</Button>}
        {dirty && <Button size="sm" loading={busy} onClick={async () => {
          setBusy(true);
          try { await instagram.update(account.id, { ice_breakers: items.filter((x) => x.trim()).map((question) => ({ question: question.trim() })) }); onToast("Ice breakers saved"); onSaved(); } catch (e) { onToast(errorMessage(e), "error"); } finally { setBusy(false); }
        }}>Save</Button>}
      </div>
    </div>
  );
}

function TokenModal({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected: (a: IgAccount) => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Connect with an access token" width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={token.trim().length < 20} onClick={async () => {
        setBusy(true); setErr(null);
        try { const a = await instagram.connectToken(token.trim()); setToken(""); onConnected(a); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      }}>Connect</Button></>}>
      {err && <Alert>{err}</Alert>}
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-[12.5px] text-white/55">
        <li>In the <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-sky-300 underline">Meta app dashboard</a>, open your app → Instagram → API setup with Instagram business login.</li>
        <li>Add your Instagram account (as a tester while the app is in development) and click <b>Generate token</b>.</li>
        <li>Paste the token below. We store it encrypted and renew it automatically before it expires.</li>
      </ol>
      <Field label="Instagram access token"><Textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="IGAA…" autoComplete="off" /></Field>
    </Modal>
  );
}

function SetupGuide({ setup }: { setup: IgSetup }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="mt-6 p-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span><span className="text-[14px] font-semibold text-white">Meta app setup</span><span className="ml-2 text-[12.5px] text-white/45">platform admins only — customers never see this</span></span>
        <span className="text-[12.5px] text-sky-300">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] text-white/60">
            <li>Create a Business-type app at <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-sky-300 underline">developers.facebook.com <ExternalLink size={10} className="inline" /></a> and add the <b>Instagram</b> product (API setup with Instagram business login).</li>
            <li>Set the server&apos;s INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET from Instagram → App settings.</li>
            <li>Under Business login settings, add the redirect URL below to “OAuth redirect URIs”.</li>
            <li>Under Webhooks, use the callback URL and verify token below, then subscribe to: comments, live_comments, messages, messaging_postbacks, messaging_seen, message_reactions, messaging_referral.</li>
            <li>Request Advanced Access for {setup.scopes.join(", ")} in App Review before going live with other people&apos;s accounts.</li>
          </ol>
          <CopyField label="OAuth redirect URI" value={setup.redirect_uri} />
          <CopyField label="Webhook callback URL" value={setup.webhook_url} />
          <CopyField label="Webhook verify token" value={setup.verify_token} />
          {!(setup.app_id_configured && setup.app_secret_configured) && <Alert tone="yellow">INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET aren&apos;t set on the server — customers can&apos;t use “Connect with Instagram” and incoming webhooks are rejected until they are.</Alert>}
        </div>
      )}
    </Card>
  );
}
