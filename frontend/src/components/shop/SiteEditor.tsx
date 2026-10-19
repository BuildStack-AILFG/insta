"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Globe, Image as ImageIcon, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, CopyField, cx, Field, Input, Select, Textarea, Toggle, useUi } from "@/components/ui/kit";
import { errorMessage, shop as api, type HeroSlide, type Product, type Shop, type ShopSite, type SiteColors, type SiteSection, type SiteTextKey } from "@/lib/api";
import { ACCENTS } from "./CreateShopWizard";
import PhotoUpload from "./PhotoUpload";
import TemplatePicker, { TemplateThumb } from "./TemplatePicker";
import { getTemplate, HOME_LABELS, homeOrder } from "@/lib/store/templates";

const SECTIONS: { id: SiteSection; label: string; hint: string }[] = [
  { id: "categories", label: "Shop by category", hint: "Photo tiles under the banner, one per category" },
  { id: "best_sellers", label: "Best sellers", hint: "Products you tick as Best sellers, or else your top sellers" },
  { id: "new_arrivals", label: "New arrivals", hint: "Products you tick as New arrivals, or else your newest" },
  { id: "all_products", label: "Shop all", hint: "Grid of every product" },
  { id: "instagram", label: "Shop our Instagram", hint: "Product photos linked to your posts" },
  { id: "about", label: "About", hint: "Your story (fill it in below)" },
  { id: "testimonials", label: "Customer reviews", hint: "Reviews you add below" },
  { id: "faq", label: "FAQ", hint: "Questions & answers" },
];
const URL_RE = /^https?:\/\/\S+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const THEMES: { name: string; colors: SiteColors; accent?: string }[] = [
  { name: "Classic white", colors: { background: "#ffffff", text: "#171717", surface: "#f6f6f4", button_text: "#ffffff" } },
  { name: "Cream", colors: { background: "#fbf7f0", text: "#2b2118", surface: "#f1e8da", button_text: "#ffffff" }, accent: "#9a3412" },
  { name: "Blush", colors: { background: "#fff6f8", text: "#3b0a1a", surface: "#fde6ec", button_text: "#ffffff" }, accent: "#db2777" },
  { name: "Sage", colors: { background: "#f4f7f2", text: "#1f2a1c", surface: "#e4ecdf", button_text: "#ffffff" }, accent: "#3f6212" },
  { name: "Midnight", colors: { background: "#0b0b0f", text: "#f5f5f5", surface: "#17171f", button_text: "#0b0b0f" }, accent: "#f5d0a9" },
];
const sameColors = (a: SiteColors, b: SiteColors) => (Object.keys(b) as (keyof SiteColors)[]).every((k) => a[k].toLowerCase() === b[k].toLowerCase());

const TEXTS: [SiteTextKey, string][] = [
  ["hero_button", "Banner button"], ["categories_title", "Categories — heading"], ["best_sellers_title", "Best sellers — heading"], ["best_sellers_subtitle", "Best sellers — line below"],
  ["new_arrivals_title", "New arrivals — heading"], ["new_arrivals_subtitle", "New arrivals — line below"], ["all_products_title", "All products — heading"],
  ["instagram_title", "Instagram — heading"], ["instagram_subtitle", "Instagram — line below"], ["faq_title", "FAQ — heading"],
  ["related_title", "Product page — more products"], ["add_to_cart", "Add to cart button"], ["buy_now", "Buy now button"], ["book_now", "Book now button (hotel template)"], ["empty_store", "When there are no products"],
];
/** Headings and copy inside the template home pages. `long` ones are short paragraphs. */
const TEMPLATE_TEXTS: [SiteTextKey, string, boolean?][] = [
  ["testimonials_title", "Customer reviews — heading"], ["lookbook_title", "Fashion — photo collage heading"], ["lookbook_subtitle", "Fashion — photo collage line below"],
  ["steps_title", "Bakery — ordering steps heading"], ["step1_title", "Step 1 — title"], ["step1_text", "Step 1 — description", true], ["step2_title", "Step 2 — title"],
  ["step2_text", "Step 2 — description", true], ["step3_title", "Step 3 — title"], ["step3_text", "Step 3 — description", true],
  ["custom_title", "Custom order card — heading"], ["custom_text", "Custom order card — text", true], ["custom_button", "Custom order card — button"],
];

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function contrastWarnings(s: ShopSite): string[] {
  const ok = [s.accent, ...Object.values(s.colors)].every((c) => HEX.test(c));
  if (!ok) return [];
  const out = [];
  if (contrast(s.colors.text, s.colors.background) < 4.5) out.push("Text is hard to read on this background — pick a darker or lighter text colour.");
  if (contrast(s.colors.button_text, s.accent) < 3) out.push("Button text is hard to read on the button colour.");
  return out;
}

function ColorField({ label, value, onChange, swatches }: { label: string; value: string; onChange: (v: string) => void; swatches?: string[] }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-9 w-11 cursor-pointer rounded-md border border-white/15 bg-transparent p-0.5" aria-label={label} />
        <Input value={value} maxLength={7} onChange={(e) => onChange(e.target.value.trim())} className="!w-28 font-mono" aria-label={`${label} (hex)`} />
        {swatches && <div className="flex flex-wrap gap-1.5">{swatches.map((c) => (
          <button key={c} onClick={() => onChange(c)} style={{ background: c }} aria-label={`Use ${c}`}
            className={cx("h-6 w-6 rounded-full ring-offset-1 ring-offset-[var(--background)]", value.toLowerCase() === c ? "ring-2 ring-white" : "hover:scale-110")} />
        ))}</div>}
      </div>
    </Field>
  );
}

/** A compact choice between a few options (grid columns, banner height…). */
function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 p-0.5 text-[12.5px]">
      {options.map((o) => (
        <button key={String(o.id)} type="button" onClick={() => onChange(o.id)} className={cx("rounded-md px-3 py-1.5", value === o.id ? "bg-white/10 text-white" : "text-white/55 hover:text-white")}>{o.label}</button>
      ))}
    </div>
  );
}

/** Connect the seller's own domain: save it, show the DNS record to add, then check it until it's live. */
function DomainCard({ shop, onChanged }: { shop: Shop; onChanged: () => void }) {
  const { toast, confirm } = useUi();
  const [domain, setDomain] = useState(shop.custom_domain ?? "");
  const [current, setCurrent] = useState(shop);
  const [busy, setBusy] = useState<"save" | "check" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = async (value: string) => {
    setBusy("save"); setErr(null); setNote(null);
    try { const s = await api.setDomain(value); setCurrent(s); setDomain(s.custom_domain ?? ""); onChanged(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  };
  const check = async () => {
    setBusy("check"); setErr(null);
    try {
      const r = await api.checkDomain();
      setCurrent(r.shop); setNote(r.message);
      if (r.shop.domain_status === "active") { toast("Your domain is live 🎉"); onChanged(); }
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (await confirm({ title: `Disconnect ${current.custom_domain}?`, body: `Your store stays at ${current.default_url}.`, confirmLabel: "Disconnect", danger: true })) await save("");
  };
  const dns = current.domain_dns;
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-white"><Globe size={15} /> Custom URL (your own domain)
        {current.domain_status === "active" && <Badge tone="green">live</Badge>}{current.domain_status === "pending" && <Badge tone="yellow">waiting for DNS</Badge>}
      </div>
      <p className="mb-3 text-[12px] text-white/45">Use a domain you own, like <b>shop.yourbrand.com</b>. Your free address keeps working: <span className="font-mono">{current.default_url}</span></p>
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Input value={domain} placeholder="shop.yourbrand.com" onChange={(e) => setDomain(e.target.value)} className="!w-72" aria-label="Your domain" />
        <Button loading={busy === "save"} disabled={!domain.trim() || domain.trim().toLowerCase() === current.custom_domain} onClick={() => save(domain)}>{current.custom_domain ? "Change domain" : "Connect domain"}</Button>
        {current.custom_domain && <Button variant="ghost" onClick={remove}>Disconnect</Button>}
      </div>
      {current.custom_domain && dns && current.domain_status !== "active" && (
        <div className="mt-4 space-y-3 rounded-lg bg-white/[0.03] p-4">
          <p className="text-[12.5px] text-white/70">Step 1 — at your domain provider (GoDaddy, Hostinger, Namecheap…) open DNS settings and add this record:</p>
          <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
            <span className="text-white/45">Type</span><span className="font-mono text-white">{dns.type}</span>
            <span className="text-white/45">Name</span><span className="font-mono text-white">{dns.name}</span>
            <span className="text-white/45">Value</span><span className="font-mono text-white">{dns.value}</span>
          </div>
          <CopyField label="Value to paste" value={dns.value} />
          <p className="text-[12.5px] text-white/70">Step 2 — wait a few minutes (sometimes a few hours), then check:</p>
          <Button size="sm" loading={busy === "check"} onClick={check}><RefreshCw size={13} /> Check connection</Button>
          {note && <p className="text-[12px] text-amber-200/90">{note}</p>}
        </div>
      )}
      {current.domain_status === "active" && (
        <p className="mt-3 text-[13px] text-emerald-300">Live at <a href={`https://${current.custom_domain}`} target="_blank" rel="noreferrer" className="underline">https://{current.custom_domain}</a> — store links in DMs and payment pages now use it.</p>
      )}
    </Card>
  );
}

/** The Website tab: brand colour, announcement, banner carousel, sections, about, FAQ and policies of the storefront. */
export default function SiteEditor({ shop, products, onSaved }: { shop: Shop; products: Product[]; onSaved: () => void }) {
  const { toast } = useUi();
  const [s, setS] = useState<ShopSite>(shop.site);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [undo, setUndo] = useState<ShopSite | null>(null); // the settings from before a template was chosen, until saved
  const set = (p: Partial<ShopSite>) => setS((x) => ({ ...x, ...p }));
  const setSlide = (i: number, p: Partial<HeroSlide>) => setS((x) => ({ ...x, hero: x.hero.map((h, j) => (j === i ? { ...h, ...p } : h)) }));
  const move = (i: number, d: -1 | 1) => { const h = [...s.hero]; [h[i], h[i + d]] = [h[i + d], h[i]]; set({ hero: h }); };
  const photos = Array.from(new Set(products.flatMap((p) => [p.image_url, ...(p.images ?? [])]).filter((u): u is string => !!u)));

  const problem = !HEX.test(s.accent) || !Object.values(s.colors).every((c) => HEX.test(c)) ? "Colours must look like #e11d48."
    : s.hero.some((h) => !URL_RE.test(h.image_url)) ? "Every banner needs a photo link starting with https://"
    : s.about.image_url && !URL_RE.test(s.about.image_url) ? "The about photo must be a link starting with https://"
    : s.faq.some((f) => !f.q.trim() || !f.a.trim()) ? "Fill in both the question and the answer (or remove it)."
    : s.testimonials.some((t) => !t.name.trim() || !t.text.trim()) ? "Fill in the name and the review for every customer review (or remove it)." : null;

  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.saveSite({ ...s, about: { ...s.about, image_url: s.about.image_url?.trim() || null } }); setUndo(null); toast("Website saved"); onSaved(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  /** "Use this template" from the gallery: show it in the editor only. Nothing is saved until the seller presses Save, and Undo restores the previous settings. */
  const useTemplate = (next: ShopSite) => { setUndo((u) => u ?? s); setS(next); };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}

        {undo && (
          <Alert tone="blue">
            Template chosen — it isn&apos;t live yet. Press <b>Save website</b> to publish it.{" "}
            <button className="font-semibold underline" onClick={() => { setS(undo); setUndo(null); }}>Undo</button>
          </Alert>
        )}
        <TemplatePicker shop={shop} site={s} onApply={useTemplate} />

        <Card className="p-5">
          <div className="mb-1 text-[14px] font-semibold text-white">Colours</div>
          <p className="mb-3 text-[12px] text-white/45">Start from a theme, then fine-tune any colour.</p>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button key={t.name} onClick={() => set({ colors: t.colors, ...(t.accent ? { accent: t.accent } : {}) })}
                className={cx("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px]", sameColors(s.colors, t.colors) ? "border-[var(--brand)] text-white" : "border-white/15 text-white/65 hover:text-white")}>
                <span className="flex h-4 w-6 overflow-hidden rounded-full border border-white/20"><span className="flex-1" style={{ background: t.colors.background }} /><span className="flex-1" style={{ background: t.colors.text }} /></span>{t.name}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ColorField label="Buttons & highlights" value={s.accent} onChange={(v) => set({ accent: v })} swatches={ACCENTS} />
            <ColorField label="Text on buttons" value={s.colors.button_text} onChange={(v) => set({ colors: { ...s.colors, button_text: v } })} />
            <ColorField label="Page background" value={s.colors.background} onChange={(v) => set({ colors: { ...s.colors, background: v } })} />
            <ColorField label="Text" value={s.colors.text} onChange={(v) => set({ colors: { ...s.colors, text: v } })} />
            <ColorField label="Cards & footer" value={s.colors.surface} onChange={(v) => set({ colors: { ...s.colors, surface: v } })} />
          </div>
          {contrastWarnings(s).map((w) => <p key={w} className="mt-2 text-[12px] text-amber-200/90">⚠ {w}</p>)}
          <Field label="Announcement bar" hint="Leave empty to show your delivery and COD offers automatically." className="mt-4">
            <Input value={s.announcement} maxLength={120} placeholder="Diwali sale — 20% off till Sunday 🪔" onChange={(e) => set({ announcement: e.target.value })} />
          </Field>
        </Card>

        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[14px] font-semibold text-white">Banner carousel</span>
            {s.hero.length < 6 && <Button size="sm" variant="ghost" onClick={() => set({ hero: [...s.hero, { image_url: photos[0] ?? "", title: "", subtitle: "", cta_label: "Shop now", product_id: null }] })}><Plus size={13} /> Add banner</Button>}
          </div>
          <p className="mb-3 text-[12px] text-white/45">{s.hero.length ? "Slides change every 5 seconds." : "No banners yet — your first three product photos are used automatically."}</p>
          <div className="space-y-3">{s.hero.map((h, i) => (
            <div key={i} className="flex gap-3 rounded-xl bg-white/[0.03] p-3">
              {URL_RE.test(h.image_url) ? <img src={h.image_url} alt="" className="h-24 w-36 shrink-0 rounded-lg object-cover" /> : <div className="flex h-24 w-36 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/30"><ImageIcon size={18} /></div>}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex gap-2">
                  <Input value={h.image_url} placeholder="Photo link (https://…)" onChange={(e) => setSlide(i, { image_url: e.target.value })} />
                  <PhotoUpload label="Upload" onUploaded={([u]) => setSlide(i, { image_url: u })} />
                  {photos.length > 0 && (
                    <Select value="" onChange={(e) => e.target.value && setSlide(i, { image_url: e.target.value })} className="!w-36" aria-label="Use a product photo">
                      <option value="">Product photo…</option>{photos.map((u, k) => <option key={u} value={u}>Photo {k + 1}</option>)}
                    </Select>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input value={h.title} maxLength={80} placeholder="Title — e.g. Festive edit" onChange={(e) => setSlide(i, { title: e.target.value })} />
                  <Input value={h.subtitle} maxLength={160} placeholder="Subtitle (optional)" onChange={(e) => setSlide(i, { subtitle: e.target.value })} />
                  <Input value={h.cta_label} maxLength={24} placeholder="Button text" onChange={(e) => setSlide(i, { cta_label: e.target.value })} />
                  <Select value={h.product_id ?? ""} onChange={(e) => setSlide(i, { product_id: e.target.value || null })} aria-label="Button opens">
                    <option value="">Button opens: all products</option>{products.map((p) => <option key={p.id} value={p.id}>Opens: {p.name}</option>)}
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move up"><ArrowUp size={14} /></button>
                <button onClick={() => move(i, 1)} disabled={i === s.hero.length - 1} className="rounded p-1 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move down"><ArrowDown size={14} /></button>
                <button onClick={() => set({ hero: s.hero.filter((_, j) => j !== i) })} className="rounded p-1 text-white/40 hover:text-red-300" aria-label="Remove banner"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}</div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 text-[14px] font-semibold text-white">Sections on the home page</div>
          <div className="grid gap-2 sm:grid-cols-2">{SECTIONS.map((x) => (
            <label key={x.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/80">
              <span>{x.label}<span className="block text-[11.5px] text-white/40">{x.hint}</span></span>
              <Toggle checked={s.sections[x.id]} label={x.label} onChange={(v) => set({ sections: { ...s.sections, [x.id]: v } })} />
            </label>
          ))}</div>
        </Card>

        <Card className="p-5">
          <div className="mb-1 text-[14px] font-semibold text-white">Layout</div>
          <p className="mb-4 text-[12px] text-white/45">How your store is laid out. These work with every template.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Products per row (computer)"><Seg value={s.grid_columns} options={[{ id: 3, label: "3" }, { id: 4, label: "4" }]} onChange={(v) => set({ grid_columns: v })} /></Field>
            <Field label="Banner height (computer)"><Seg value={s.hero_height} options={[{ id: "compact", label: "Compact" }, { id: "normal", label: "Normal" }, { id: "tall", label: "Tall" }]} onChange={(v) => set({ hero_height: v })} /></Field>
          </div>
          <label className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/80">
            <span>My photos are product shots on a plain background<span className="block text-[11.5px] text-white/40">Shows the whole product without cropping it, on a soft tinted tile.</span></span>
            <Toggle checked={s.photo_fit === "contain"} label="Show whole product photos" onChange={(v) => set({ photo_fit: v ? "contain" : "cover" })} />
          </label>
        </Card>

        {s.template !== "classic" && (
          <Card className="p-5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-white">Order of home page sections</span>
              {s.section_order.length > 0 && <Button size="sm" variant="ghost" onClick={() => set({ section_order: [] })}>Reset to template order</Button>}
            </div>
            <p className="mb-3 text-[12px] text-white/45">Move sections up or down. Hide a section with the switches above.</p>
            <div className="space-y-1.5">
              {homeOrder(s.template, s.section_order).map((k, i, all) => (
                <div key={k} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-[13px] text-white/80">
                  <span className="w-5 text-white/35">{i + 1}</span><span className="flex-1">{HOME_LABELS[k] ?? k}</span>
                  <button disabled={i === 0} onClick={() => { const o = [...all]; [o[i - 1], o[i]] = [o[i], o[i - 1]]; set({ section_order: o }); }} className="rounded p-1 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move up"><ArrowUp size={14} /></button>
                  <button disabled={i === all.length - 1} onClick={() => { const o = [...all]; [o[i + 1], o[i]] = [o[i], o[i + 1]]; set({ section_order: o }); }} className="rounded p-1 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move down"><ArrowDown size={14} /></button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="mb-3 text-[14px] font-semibold text-white">About your brand</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Heading"><Input value={s.about.title} maxLength={80} placeholder={`About ${shop.name}`} onChange={(e) => set({ about: { ...s.about, title: e.target.value } })} /></Field>
            <Field label="Photo (optional)">
              <div className="flex gap-2">
                <Input value={s.about.image_url ?? ""} placeholder="https://…" onChange={(e) => set({ about: { ...s.about, image_url: e.target.value } })} />
                <PhotoUpload label="Upload" onUploaded={([u]) => setS((x) => ({ ...x, about: { ...x.about, image_url: u } }))} />
              </div>
            </Field>
          </div>
          <Field label="Your story" className="mt-3"><Textarea rows={4} maxLength={1500} value={s.about.text} placeholder="How it started, what makes your products special…" onChange={(e) => set({ about: { ...s.about, text: e.target.value } })} /></Field>
        </Card>

        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[14px] font-semibold text-white">FAQ</span>
            {s.faq.length < 12 && <Button size="sm" variant="ghost" onClick={() => set({ faq: [...s.faq, { q: "", a: "" }] })}><Plus size={13} /> Add question</Button>}
          </div>
          <p className="mb-3 text-[12px] text-white/45">{s.faq.length ? "" : "Empty = answers about COD, payments, delivery and tracking are written from your settings."}</p>
          <div className="space-y-3">{s.faq.map((f, i) => (
            <div key={i} className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Input value={f.q} maxLength={150} placeholder="Question" onChange={(e) => set({ faq: s.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                <Textarea rows={2} maxLength={600} value={f.a} placeholder="Answer" onChange={(e) => set({ faq: s.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
              </div>
              <button onClick={() => set({ faq: s.faq.filter((_, j) => j !== i) })} className="self-start rounded p-1.5 text-white/40 hover:text-red-300" aria-label="Remove question"><Trash2 size={14} /></button>
            </div>
          ))}</div>
        </Card>

        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[14px] font-semibold text-white">Customer reviews</span>
            {s.testimonials.length < 6 && <Button size="sm" variant="ghost" onClick={() => set({ testimonials: [...s.testimonials, { name: "", text: "" }] })}><Plus size={13} /> Add review</Button>}
          </div>
          <p className="mb-3 text-[12px] text-white/45">{s.testimonials.length ? "Only add real reviews from your customers." : "Add up to 6 real reviews from your customers. They appear on your home page."}</p>
          <div className="space-y-3">{s.testimonials.map((t, i) => (
            <div key={i} className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Input value={t.name} maxLength={60} placeholder="Customer name — e.g. Meera K." onChange={(e) => set({ testimonials: s.testimonials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Textarea rows={2} maxLength={400} value={t.text} placeholder="What they said" onChange={(e) => set({ testimonials: s.testimonials.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              </div>
              <button onClick={() => set({ testimonials: s.testimonials.filter((_, j) => j !== i) })} className="self-start rounded p-1.5 text-white/40 hover:text-red-300" aria-label="Remove review"><Trash2 size={14} /></button>
            </div>
          ))}</div>
        </Card>

        <Card className="p-5">
          <div className="mb-1 text-[14px] font-semibold text-white">Texts</div>
          <p className="mb-3 text-[12px] text-white/45">Every heading and button on your website — write them your way, in any language. Empty = the default.</p>
          <div className="grid gap-3 sm:grid-cols-2">{TEXTS.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input value={s.texts[key] === shop.default_texts[key] ? "" : s.texts[key]} maxLength={80} placeholder={shop.default_texts[key]}
                onChange={(e) => set({ texts: { ...s.texts, [key]: e.target.value || shop.default_texts[key] } })} />
            </Field>
          ))}</div>
          <div className="mb-2 mt-5 text-[13px] font-semibold text-white">Template sections</div>
          <p className="mb-3 text-[12px] text-white/45">Used by the niche templates (Fashion, Bakery & Food, …) and the customer reviews. Leave empty to keep the default.</p>
          <div className="grid gap-3 sm:grid-cols-2">{TEMPLATE_TEXTS.map(([key, label, long]) => (
            <Field key={key} label={label} className={long ? "sm:col-span-2" : undefined}>
              {long
                ? <Textarea rows={2} value={s.texts[key] === shop.default_texts[key] ? "" : s.texts[key]} maxLength={200} placeholder={shop.default_texts[key]}
                    onChange={(e) => set({ texts: { ...s.texts, [key]: e.target.value || shop.default_texts[key] } })} />
                : <Input value={s.texts[key] === shop.default_texts[key] ? "" : s.texts[key]} maxLength={80} placeholder={shop.default_texts[key]}
                    onChange={(e) => set({ texts: { ...s.texts, [key]: e.target.value || shop.default_texts[key] } })} />}
            </Field>
          ))}</div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 text-[14px] font-semibold text-white">Policies (shown in the footer)</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shipping"><Textarea rows={3} maxLength={1000} value={s.policies.shipping} placeholder="We ship in 2–3 working days…" onChange={(e) => set({ policies: { ...s.policies, shipping: e.target.value } })} /></Field>
            <Field label="Returns & refunds"><Textarea rows={3} maxLength={1000} value={s.policies.returns} placeholder="Exchanges within 7 days…" onChange={(e) => set({ policies: { ...s.policies, returns: e.target.value } })} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-1 text-[14px] font-semibold text-white">Size guide</div>
          <p className="mb-3 text-[12px] text-white/45">Optional. Shown as a &quot;Size guide&quot; link next to a Size option on product pages (niche templates).</p>
          <Textarea rows={4} maxLength={1500} value={s.size_guide} placeholder={"S: bust 34 in · M: bust 36 in · L: bust 38 in\nNot sure? DM us your measurements."} onChange={(e) => set({ size_guide: e.target.value })} />
        </Card>

        <DomainCard shop={shop} onChanged={onSaved} />
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card className="space-y-4 p-5">
          <TemplateThumb t={{ ...getTemplate(s.template), accent: HEX.test(s.accent) ? s.accent : "#e11d48", colors: Object.values(s.colors).every((c) => HEX.test(c)) ? s.colors : getTemplate(s.template).colors }} />
          <div className="text-[12px] text-amber-200/80">{problem ?? ""}</div>
          <div className="flex gap-2">
            <Button className="flex-1" loading={busy} disabled={!!problem} onClick={save}>Save website</Button>
            <a href={shop.url} target="_blank" rel="noreferrer"><Button variant="ghost"><ExternalLink size={14} /> View</Button></a>
          </div>
          <p className="text-[11.5px] text-white/40">Save, then open your website to see the changes.</p>
        </Card>
      </div>
    </div>
  );
}
