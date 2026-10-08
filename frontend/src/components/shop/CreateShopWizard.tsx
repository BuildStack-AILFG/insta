"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Globe, Instagram, PartyPopper, Plus, Store } from "lucide-react";
import { Alert, Button, Card, CopyField, cx, Field, Input, Select, Toggle } from "@/components/ui/kit";
import MediaPicker from "@/components/dashboard/MediaPicker";
import { errorMessage, shop as api, type IgAccount, type Shop, type ShopOverview, type SiteColors } from "@/lib/api";
import { toMinor } from "@/lib/money";

export const ACCENTS = ["#e11d48", "#db2777", "#9333ea", "#2563eb", "#0d9488", "#16a34a", "#ea580c", "#171717"];
const STEPS = ["Your brand", "Getting paid", "Look", "Products"];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** The "Create your shop" screen and its four steps: brand → payments & delivery → colour → first products. */
export default function CreateShopWizard({ accounts, payments, onDone }: { accounts: IgAccount[]; payments: ShopOverview["payments"]; onDone: () => void }) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(accounts[0]?.name ?? "");
  const [slug, setSlug] = useState(slugify(accounts[0]?.username ?? ""));
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagline, setTagline] = useState("");
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [cod, setCod] = useState(true);
  const [online, setOnline] = useState(true);
  const [fee, setFee] = useState("");
  const [freeAbove, setFreeAbove] = useState("");
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [created, setCreated] = useState<Shop | null>(null);
  const [picking, setPicking] = useState(false);
  const [imported, setImported] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const problem = step === 0
    ? (!name.trim() ? "Name your shop." : !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) ? "The web address needs 3–40 lowercase letters, numbers or dashes." : null)
    : step === 1 ? (!cod && !online ? "Turn on cash on delivery, online payments, or both." : fee.trim() && toMinor(fee) === null ? "The delivery fee isn't a valid amount." : null)
    : null;
  const account = accounts.find((a) => a.id === accountId);

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      await api.save({
        slug, name: name.trim(), tagline: tagline.trim(), account_id: accountId || null, logo_url: null, published: true, online_payments: online, cod_enabled: cod,
        shipping_fee: toMinor(fee) ?? 0, free_shipping_above: freeAbove.trim() ? toMinor(freeAbove) : null, support_phone: "", confirmation_message: "",
        chat_orders: true, cod_confirmation: true, reminders_enabled: true, reminder_after_minutes: 60, reminder_message: "", gstin: "", legal_name: "", business_address: "", gst_rate: 0,
      });
      const shop = await api.get();
      const site = { ...shop.shop!.site, accent };
      setCreated(await api.saveSite(site));
      setStep(3);
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const importPosts = async (ids: string[]) => {
    setPicking(false);
    if (!account || !ids.length) return;
    setBusy(true);
    try { const r = await api.importPosts(account.id, ids); setImported((n) => n + r.created.length); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  if (!started) {
    return (
      <Card className="overflow-hidden">
        <div className="grid items-center gap-8 p-8 lg:grid-cols-[1.1fr_1fr] lg:p-10">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-[12px] text-white/70"><Store size={13} /> Instagram Shop</span>
            <h2 className="mt-4 text-[30px] font-bold leading-tight text-white">Create your shop</h2>
            <p className="mt-2 max-w-md text-[14.5px] text-white/60">A free website for your Instagram business in two minutes — no coding, no hosting.</p>
            <ul className="mt-5 space-y-2 text-[13.5px] text-white/75">
              {["A clean white website with banners, carousels and your products", "Products straight from your Instagram posts", "UPI, card & cash-on-delivery checkout",
                "Comment “price” → buy in the DM → order lands here"].map((t) => <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-300" />{t}</li>)}
            </ul>
            <Button className="mt-7" onClick={() => setStarted(true)}><Plus size={15} /> Create your shop</Button>
          </div>
          <SitePreview name={name || "Your shop"} accent={accent} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-3xl p-6 sm:p-8">
      <ol className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className={cx("flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px]", i === step ? "bg-[var(--brand)] text-white" : i < step ? "text-emerald-300" : "text-white/40")}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">{i < step ? <Check size={11} /> : i + 1}</span>{s}
          </li>
        ))}
      </ol>
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}

      {step === 0 && (
        <div className="space-y-4">
          <h3 className="text-[18px] font-semibold text-white">Tell us about your brand</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shop name"><Input value={name} maxLength={100} autoFocus placeholder="Priya's Boutique" onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} /></Field>
            <Field label="Web address" hint={`${typeof window !== "undefined" ? window.location.host : ""}/s/${slug || "your-shop"}`}>
              <Input value={slug} maxLength={40} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} />
            </Field>
          </div>
          <Field label="One line about you (optional)"><Input value={tagline} maxLength={300} placeholder="Handmade kurtis · Pune · Ships across India" onChange={(e) => setTagline(e.target.value)} /></Field>
          <Field label="Instagram account" hint={accounts.length ? "Order updates are sent from its DMs, and its profile photo becomes your logo." : "Connect Instagram to sell from comments and DMs."}>
            {accounts.length
              ? <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">None</option>{accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}</Select>
              : <Link href="/dashboard/instagram" className="text-[13px] text-sky-300 underline">Connect Instagram</Link>}
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-[18px] font-semibold text-white">How do customers pay?</h3>
          <label className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3 text-[13.5px] text-white/80"><Toggle checked={cod} label="COD" onChange={setCod} /> Cash on delivery</label>
          <label className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3 text-[13.5px] text-white/80">
            <Toggle checked={online} label="Online" onChange={setOnline} /> UPI, cards &amp; netbanking (your own Razorpay — money comes straight to you)
          </label>
          {online && !payments.connected && <Alert tone="yellow">You can connect Razorpay after this in <Link href="/dashboard/settings?tab=payments" className="underline">Settings → Payments</Link>. Until then, buyers see cash on delivery only.</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delivery fee (₹)" hint="Leave empty for free delivery"><Input value={fee} inputMode="decimal" placeholder="50" onChange={(e) => setFee(e.target.value)} /></Field>
            <Field label="Free delivery above (₹, optional)"><Input value={freeAbove} inputMode="decimal" placeholder="999" onChange={(e) => setFreeAbove(e.target.value)} /></Field>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-6 sm:grid-cols-[1fr_1.1fr]">
          <div>
            <h3 className="text-[18px] font-semibold text-white">Pick your brand colour</h3>
            <p className="mt-1 text-[13px] text-white/50">Your website uses a clean white template; this colour is used for buttons, badges and the announcement bar.</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {ACCENTS.map((c) => (
                <button key={c} onClick={() => setAccent(c)} aria-label={`Colour ${c}`} style={{ background: c }}
                  className={cx("h-10 w-10 rounded-full ring-offset-2 ring-offset-[var(--background)] transition", accent === c ? "ring-2 ring-white" : "hover:scale-110")} />
              ))}
            </div>
            <p className="mt-4 text-[12px] text-white/40">You can change the banners, colour, about section and FAQ any time in the Website tab.</p>
          </div>
          <SitePreview name={name} accent={accent} />
        </div>
      )}

      {step === 3 && created && (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <PartyPopper className="mt-0.5 shrink-0 text-amber-300" size={26} />
            <div>
              <h3 className="text-[18px] font-semibold text-white">Your website is live!</h3>
              <p className="mt-0.5 text-[13px] text-white/55">Put this link in your Instagram bio. Now add a few products so it isn&apos;t empty.</p>
            </div>
          </div>
          <CopyField label="Your shop's link" value={created.url} />
          <div className="grid gap-3 sm:grid-cols-2">
            <button disabled={!account || busy} onClick={() => setPicking(true)} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07] disabled:opacity-50">
              <Instagram size={18} className="text-pink-300" />
              <div className="mt-2 text-[14px] font-semibold text-white">Import from Instagram posts</div>
              <div className="text-[12px] text-white/50">{account ? "Pick your product posts — name, price and photo come from the post." : "Connect Instagram first."}</div>
            </button>
            <button onClick={onDone} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]">
              <Plus size={18} className="text-sky-300" />
              <div className="mt-2 text-[14px] font-semibold text-white">Add products myself</div>
              <div className="text-[12px] text-white/50">Photos, prices, sizes and colours.</div>
            </button>
          </div>
          {imported > 0 && <Alert tone="green">{imported} product{imported === 1 ? "" : "s"} added. Posts without a price in the caption are hidden until you add one.</Alert>}
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-white/15 p-4">
            <Globe size={18} className="mt-0.5 shrink-0 text-sky-300" />
            <div className="text-[12.5px] text-white/60">
              <span className="font-semibold text-white">Want your own web address?</span> Connect a domain like <b>shop.yourbrand.com</b> any time in
              <b> Shop → Website → Custom URL</b> — colours, texts and banners are there too.
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <span className="text-[12px] text-amber-200/80">{problem ?? ""}</span>
        <div className="flex gap-2">
          {step > 0 && step < 3 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 2 && <Button disabled={!!problem} onClick={() => setStep(step + 1)}>Next</Button>}
          {step === 2 && <Button loading={busy} onClick={create}>Create my website</Button>}
          {step === 3 && created && <>
            <a href={created.url} target="_blank" rel="noreferrer"><Button variant="ghost"><ExternalLink size={14} /> View website</Button></a>
            <Button onClick={onDone}>Go to my shop</Button>
          </>}
        </div>
      </div>
      {picking && account && <MediaPicker account={account} selected={[]} onClose={() => setPicking(false)} onDone={(sel) => importPosts(sel.map((m) => m.id))} />}
    </Card>
  );
}

/** A small mock of the white store template, tinted with the chosen colour. */
export function SitePreview({ name, accent, colors = DEFAULT_COLORS }: { name: string; accent: string; colors?: SiteColors }) {
  const mix = (pct: number) => `color-mix(in srgb, ${colors.text} ${pct}%, ${colors.background})`;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/30" style={{ background: colors.background, color: colors.text }} aria-hidden>
      <div className="py-1 text-center text-[9px] font-medium" style={{ background: accent, color: colors.button_text }}>Free delivery above ₹999 · Cash on delivery</div>
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: `1px solid ${mix(10)}` }}>
        <span className="h-4 w-4 rounded-full" style={{ background: accent }} /><span className="truncate text-[11px] font-bold">{name || "Your shop"}</span>
        <span className="ml-auto h-3 w-3 rounded-full" style={{ background: mix(15) }} />
      </div>
      <div className="relative h-24" style={{ background: `linear-gradient(135deg, ${mix(12)}, ${mix(22)})` }}>
        <div className="absolute bottom-2 left-3"><div className="h-2 w-20 rounded bg-white/90" />
          <div className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[8px] font-semibold" style={{ background: accent, color: colors.button_text }}>Shop now</div></div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {[0, 1, 2].map((i) => (
          <div key={i}><div className="aspect-[4/5] rounded-md" style={{ background: mix(7) }} /><div className="mt-1 h-1.5 w-3/4 rounded" style={{ background: mix(18) }} />
            <div className="mt-1 h-1.5 w-1/3 rounded" style={{ background: accent, opacity: 0.85 }} /></div>
        ))}
      </div>
      <div className="h-5" style={{ background: colors.surface }} />
    </div>
  );
}

const DEFAULT_COLORS: SiteColors = { background: "#ffffff", text: "#171717", surface: "#f6f6f4", button_text: "#ffffff" };
