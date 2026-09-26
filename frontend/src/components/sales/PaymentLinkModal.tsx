"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Link2 } from "lucide-react";
import { Alert, Button, CopyField, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui/kit";
import { errorMessage, payments, type PaymentLink, type PaymentsStatus } from "@/lib/api";
import { fmtMoney, fromMinor, toMinor } from "@/lib/money";

type Props = {
  open: boolean;
  onClose: () => void;
  contact?: { id: string; name: string } | null;
  deal?: { id: string; title: string; value: number } | null;
  /** Called with a ready-to-send message (e.g. to drop into the inbox composer). */
  onInsert?: (text: string, link: PaymentLink) => void;
  onCreated?: (link: PaymentLink) => void;
};

/** Create a Razorpay payment link on the workspace's own account for a contact / deal. */
export default function PaymentLinkModal({ open, onClose, contact, deal, onInsert, onCreated }: Props) {
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expire, setExpire] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<PaymentLink | null>(null);

  useEffect(() => {
    if (!open) return;
    setMade(null);
    setError(null);
    setAmount(deal && deal.value > 0 ? fromMinor(deal.value) : "");
    setDescription(deal?.title ?? "");
    payments.settings().then(setStatus).catch(() => setStatus({ connected: false, key_id: null, test_mode: false, connected_at: null }));
  }, [open, deal]);

  const create = async () => {
    const minor = toMinor(amount);
    if (minor === null || minor < 100) return setError("Enter an amount of at least ₹1.");
    setBusy(true);
    setError(null);
    try {
      const link = await payments.createLink({ amount: minor, description: description.trim() || undefined, contact_id: contact?.id ?? null, deal_id: deal?.id ?? null, expire_days: Number(expire) });
      setMade(link);
      onCreated?.(link);
    } catch (e) {
      setError(errorMessage(e, "Couldn't create the payment link."));
    } finally {
      setBusy(false);
    }
  };

  const message = made ? `${description.trim() || "Payment"} — ${fmtMoney(made.amount, made.currency)}. Pay securely here: ${made.short_url}` : "";

  return (
    <Modal open={open} onClose={onClose} title="Request a payment" width={480}
      footer={made ? (
        <>
          <Button variant="ghost" onClick={onClose}>Done</Button>
          {onInsert && <Button onClick={() => { onInsert(message, made); onClose(); }}>Add to message</Button>}
        </>
      ) : status?.connected ? (
        <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={create}><Link2 size={14} /> Create link</Button></>
      ) : undefined}>
      {!status ? <Spinner /> : !status.connected ? (
        <div className="space-y-3 text-[13.5px] text-white/70">
          <p>Connect your Razorpay account to collect payments from customers in Instagram DMs. Money goes straight to your Razorpay account.</p>
          <Link href="/dashboard/settings?tab=payments" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium btn-accent bg-brand text-white">Connect Razorpay <ExternalLink size={13} /></Link>
        </div>
      ) : made ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[14px] font-medium text-pink-300"><CheckCircle2 size={18} /> Payment link ready — {fmtMoney(made.amount, made.currency)}</div>
          <CopyField value={made.short_url} label="Link" />
          <p className="text-[12.5px] text-white/45">We&apos;ll mark it paid here as soon as the customer pays{deal ? " and note it on the deal" : ""}.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {status.test_mode && <Alert tone="yellow">Your Razorpay account is in test mode — no real money moves.</Alert>}
          {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
          {contact && <p className="text-[13px] text-white/55">For <b className="text-white">{contact.name}</b></p>}
          <Field label="Amount (₹)"><Input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2,499" /></Field>
          <Field label="What is it for?" hint="Shown to the customer on the payment page."><Textarea rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Annual plan, order #1042…" /></Field>
          <Field label="Link expires after">
            <Select value={expire} onChange={(e) => setExpire(e.target.value)}>
              <option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="30">30 days</option><option value="0">Never</option>
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
