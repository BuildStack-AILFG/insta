"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, KeyRound, RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Card, CopyField, Field, fmtDateTime, Input, Spinner, timeAgo, useUi } from "@/components/ui/kit";
import { errorMessage, payments, type PaymentLink, type PaymentsStatus } from "@/lib/api";
import { fmtMoney } from "@/lib/money";

const TONE = { created: "yellow", paid: "green", cancelled: "gray", expired: "gray" } as const;

/** Connect the workspace's own Razorpay account so its team can send payment links to customers from the inbox and pipeline. */
export default function PaymentsTab() {
  const { toast, confirm } = useUi();
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await payments.settings();
      setStatus(s);
      if (s.connected) setLinks(await payments.links());
    } catch (e) { setErr(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setBusy(true);
    setErr(null);
    try { setStatus(await payments.connect(keyId.trim(), secret.trim())); setKeyId(""); setSecret(""); toast("Razorpay connected"); await load(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!(await confirm({ title: "Disconnect Razorpay?", body: "You won't be able to create new payment links. Existing links keep working.", confirmLabel: "Disconnect", danger: true }))) return;
    try { await payments.disconnect(); setLinks([]); await load(); toast("Disconnected"); } catch (e) { setErr(errorMessage(e)); }
  };
  const check = async (l: PaymentLink) => {
    try { const u = await payments.refreshLink(l.id); setLinks((ls) => ls.map((x) => (x.id === u.id ? u : x))); if (u.status === "paid") toast("Paid ✓"); } catch (e) { setErr(errorMessage(e)); }
  };
  const cancel = async (l: PaymentLink) => {
    if (!(await confirm({ title: "Cancel this payment link?", body: "The customer will no longer be able to pay with it.", confirmLabel: "Cancel link", danger: true }))) return;
    try { const u = await payments.cancelLink(l.id); setLinks((ls) => ls.map((x) => (x.id === u.id ? u : x))); } catch (e) { setErr(errorMessage(e)); }
  };

  if (!status) return err ? <Alert>{err}</Alert> : <Spinner />;
  const paidTotal = links.filter((l) => l.status === "paid").reduce((n, l) => n + l.amount, 0);

  return (
    <div className="space-y-5">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><KeyRound size={17} className="text-white/60" /><h3 className="text-[15px] font-semibold text-white">Collect payments from your customers</h3>
          {status.connected && <Badge tone="green" className="ml-1">Connected{status.test_mode ? " · test mode" : ""}</Badge>}</div>
        <p className="mb-4 max-w-2xl text-[13px] text-white/55">Connect your own Razorpay account, then send a payment link to any contact from the inbox or a deal. Customers pay by UPI, card or netbanking and the money settles directly to <b className="text-white/80">your</b> Razorpay account — we never touch it.</p>
        {status.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-4 py-3">
            <div className="text-[13px] text-white/70">Key <span className="font-mono text-white">{status.key_id}</span> · connected {timeAgo(status.connected_at)}</div>
            <Button size="sm" variant="danger" onClick={disconnect}>Disconnect</Button>
          </div>
        ) : (
          <div className="max-w-xl space-y-3">
            <Field label="Razorpay Key ID" hint="Razorpay Dashboard → Account & Settings → API keys. Use test keys (rzp_test_…) to try it safely."><Input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_live_xxxxxxxxxxxx" autoComplete="off" /></Field>
            <Field label="Key Secret" hint="Stored encrypted. We only use it to create payment links and check whether they were paid."><Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" /></Field>
            <Button loading={busy} disabled={!keyId.trim() || !secret.trim()} onClick={connect}>Verify &amp; connect</Button>
          </div>
        )}
      </Card>

      {status.connected && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3">
            <div className="flex items-center gap-2"><CircleDollarSign size={17} className="text-white/60" /><h3 className="text-[15px] font-semibold text-white">Payment links</h3></div>
            <span className="text-[12.5px] text-white/45">{fmtMoney(paidTotal, "INR")} collected</span>
          </div>
          {links.length === 0 ? <p className="px-5 py-6 text-[13px] text-white/40">No payment links yet. Open a chat or a deal and choose “Request payment”.</p> : links.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 border-b border-white/5 px-5 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-white">{fmtMoney(l.amount, l.currency)} <span className="text-white/45">· {l.description || "Payment"}</span></p>
                <p className="text-[12px] text-white/35">{l.contact_name ?? "No contact"} · {l.status === "paid" ? `paid ${fmtDateTime(l.paid_at)}` : `created ${timeAgo(l.created_at)}`}</p>
              </div>
              <Badge tone={TONE[l.status]}>{l.status}</Badge>
              {l.status === "created" && (<>
                <div className="hidden w-64 md:block"><CopyField value={l.short_url} /></div>
                <Button size="sm" variant="ghost" onClick={() => check(l)} aria-label="Check status"><RefreshCw size={13} /></Button>
                <Button size="sm" variant="ghost" onClick={() => cancel(l)}>Cancel</Button>
              </>)}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
