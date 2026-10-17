"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Eye, Lock, Sparkles } from "lucide-react";
import { Alert, Badge, Button, Card, cx, Modal } from "@/components/ui/kit";
import { useWorkspace } from "@/components/dashboard/WorkspaceContext";
import type { Shop, ShopSite } from "@/lib/api";
import { applyTemplate, TEMPLATES, type StoreTemplate, type TemplateId } from "@/lib/store/templates";
import { demoSlug, getDemo } from "@/lib/store/demos";

/** A tiny mock of a template's real layout (header, banner style, product-card shape) in its own colours. */
export function TemplateThumb({ t }: { t: StoreTemplate }) {
  const { background: bg, text: fg, surface } = t.colors;
  const mix = (pct: number) => `color-mix(in srgb, ${fg} ${pct}%, ${bg})`;
  const dark = t.id === "jewellery";
  const radius = t.id === "boutique" || t.id === "jewellery" ? 1 : t.id === "bakery" ? 8 : t.id === "beauty" ? 5 : 4;
  const photo = { background: `linear-gradient(135deg, ${mix(14)}, ${mix(26)})` };
  const hero = t.hero === "split" || t.hero === "panel"
    ? (
      <div className="grid h-[54px] grid-cols-2 overflow-hidden" style={{ borderRadius: t.hero === "panel" ? 8 : 0, margin: t.hero === "panel" ? "6px 8px 0" : 0 }}>
        <div className="flex flex-col justify-center gap-1 px-2" style={{ background: t.hero === "split" ? surface : `color-mix(in srgb, ${t.accent} 10%, ${bg})` }}>
          <div className="h-1.5 w-12 rounded-sm" style={{ background: fg, opacity: 0.8 }} /><div className="h-3 w-9 rounded-sm" style={{ background: t.accent }} />
        </div>
        <div style={photo} />
      </div>
    ) : (
      <div className="relative h-[54px] overflow-hidden" style={{ ...photo, borderRadius: t.hero === "inset" ? 10 : 0, margin: t.hero === "inset" ? "6px 8px 0" : 0 }}>
        <div className={cx("absolute flex flex-col gap-1", t.hero === "center" ? "inset-0 items-center justify-center" : "bottom-1.5 left-2")}>
          <div className="h-1.5 w-14 rounded-sm bg-white/90" /><div className="h-3 w-9" style={{ background: t.accent, borderRadius: t.id === "jewellery" ? 0 : 6 }} />
        </div>
      </div>
    );
  const cardBorder = t.id === "jewellery" ? `1px solid color-mix(in srgb, ${t.accent} 45%, transparent)` : t.id === "beauty" ? `1px solid ${mix(14)}` : "none";
  return (
    <div className="overflow-hidden rounded-xl border border-white/10" style={{ background: bg, color: fg }} aria-hidden>
      <div className="h-2" style={{ background: t.accent }} />
      <div className={cx("flex items-center gap-1.5 px-2 py-1.5", t.header === "center" && "justify-center")} style={{ borderBottom: `1px solid ${mix(10)}` }}>
        <span className="h-3 w-3 rounded-full" style={{ background: t.accent }} />
        <span className="text-[9px] font-bold tracking-wide">{t.header === "center" ? "STORE" : "Store"}</span>
        {t.header === "left" && <span className="ml-auto h-2 w-2 rounded-full" style={{ background: mix(18) }} />}
      </div>
      {hero}
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="p-0.5" style={{ border: cardBorder, borderRadius: radius, background: t.id === "bakery" ? surface : undefined }}>
            <div style={{ ...photo, aspectRatio: t.id === "jewellery" ? "1 / 1" : t.id === "boutique" ? "3 / 4" : "4 / 5", borderRadius: radius > 1 ? radius - 1 : 0 }} />
            <div className="mx-auto mt-1 h-1 w-3/4 rounded-sm" style={{ background: mix(dark ? 40 : 22) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A real screenshot of the template's demo store (falls back to the drawn mock until the cover exists). */
function Cover({ t }: { t: StoreTemplate }) {
  const [failed, setFailed] = useState(false);
  if (t.id === "classic" || failed) return <TemplateThumb t={t} />;
  return (
    <div className="aspect-[8/5] overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
      <img src={`/templates/${t.id}/cover.jpg`} alt={`${t.name} template`} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
    </div>
  );
}

/** Fill banners and the About photo from the template's demo — only where the seller has none. Products are never touched. */
function withDemoPlaceholders(site: ShopSite, id: TemplateId): ShopSite {
  const demo = getDemo(demoSlug(id));
  if (!demo) return site;
  const abs = (u: string) => (u.startsWith("/") ? `${window.location.origin}${u}` : u);
  const next = { ...site };
  if (site.hero.length === 0) next.hero = demo.store.site.hero.map((h) => ({ ...h, image_url: abs(h.image_url) }));
  if (!site.about.image_url) next.about = { ...site.about, image_url: abs(demo.store.site.about.image_url ?? "") };
  return next;
}

/** The Website tab's template gallery: see each template as a full demo store (or on your own products), then apply it. */
export default function TemplatePicker({ shop, site, onApply }: { shop: Shop; site: ShopSite; onApply: (next: ShopSite) => void }) {
  const { workspace } = useWorkspace();
  const canUse = workspace.features.shop_templates !== false;
  const [previewing, setPreviewing] = useState<TemplateId | null>(null);
  const [mode, setMode] = useState<"demo" | "mine">("demo");
  const [colours, setColours] = useState(false);
  const [starter, setStarter] = useState(false);
  const [placeholders, setPlaceholders] = useState(false);
  const current = site.template ?? "classic";
  const open = TEMPLATES.find((t) => t.id === previewing) ?? null;
  const hasDemo = !!open && open.id !== "classic";
  const view = hasDemo ? mode : "mine";

  const apply = (t: StoreTemplate) => {
    let next = applyTemplate(site, t.id, shop.default_texts, { colours, starter });
    if (placeholders) next = withDemoPlaceholders(next, t.id);
    onApply(next);
    setPreviewing(null);
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-white"><Sparkles size={15} /> Templates
        {!canUse && <Badge tone="yellow">Growth plan</Badge>}
      </div>
      <p className="mb-4 text-[12px] text-white/45">Ready-made designs for your kind of business, each with photos, products and content already in place. Open a live demo, or preview it on your own store — your banners, products and custom texts are never deleted.</p>
      {!canUse && (
        <Alert tone="blue">Templates are included in the Growth plan. You can preview them all now. <Link href="/dashboard/settings?tab=billing&plan=growth" className="font-semibold underline">Upgrade to Growth</Link></Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => {
          const locked = !canUse && t.id !== "classic";
          return (
            <div key={t.id} className={cx("rounded-xl border p-3", current === t.id ? "border-[var(--brand)] bg-white/[0.04]" : "border-white/10")}>
              <Cover t={t} />
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-[13.5px] font-semibold text-white">{t.name}</div>
                {current === t.id ? <Badge tone="green"><Check size={11} className="mr-0.5 inline" />In use</Badge> : locked ? <Lock size={13} className="text-white/40" aria-label="Growth plan" /> : null}
              </div>
              <div className="text-[11.5px] text-white/45">{t.niche}</div>
              <p className="mt-1 min-h-[32px] text-[12px] leading-snug text-white/55">{t.blurb}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setMode("demo"); setPreviewing(t.id); }}><Eye size={13} /> Preview</Button>
                {t.id !== "classic" && <a href={`/s/${demoSlug(t.id)}`} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink size={13} /> Live demo</Button></a>}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!open} onClose={() => setPreviewing(null)} title={open ? `${open.name} template` : ""} width={1040}
        footer={open && (
          <>
            <div className="mr-auto flex flex-col gap-1.5 text-[12.5px] text-white/70">
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={colours} onChange={(e) => setColours(e.target.checked)} /> Also use this template&apos;s colours</label>
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} /> Also fill my empty texts, About and FAQ with starter content</label>
              {hasDemo && <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={placeholders} onChange={(e) => setPlaceholders(e.target.checked)} /> Use the demo banners and About photo as placeholders (only where mine are empty)</label>}
            </div>
            <Button variant="ghost" onClick={() => setPreviewing(null)}>Close</Button>
            {!canUse && open.id !== "classic"
              ? <Link href="/dashboard/settings?tab=billing&plan=growth"><Button><Lock size={13} /> Upgrade to Growth to use</Button></Link>
              : <Button disabled={current === open.id} onClick={() => apply(open)}>{current === open.id ? "Already in use" : "Use this template"}</Button>}
          </>
        )}>
        {open && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {hasDemo && (
                <div className="inline-flex rounded-lg border border-white/10 p-0.5 text-[12.5px]">
                  {(["demo", "mine"] as const).map((m) => (
                    <button key={m} onClick={() => setMode(m)} className={cx("rounded-md px-3 py-1.5", mode === m ? "bg-white/10 text-white" : "text-white/55 hover:text-white")}>{m === "demo" ? "Demo store" : "My store"}</button>
                  ))}
                </div>
              )}
              <p className="min-w-0 flex-1 text-[12px] text-white/50">
                {view === "demo" ? "A complete demo store — click around like a real website." : "Your own store in this look (sample photos fill any gaps)."} Choosing a template only changes the editor — nothing goes live until you press Save, and you can Undo.
              </p>
            </div>
            <iframe key={`${open.id}-${view}`} title={`${open.name} preview`} src={view === "demo" ? `/s/${demoSlug(open.id)}` : `/s/${shop.slug}/preview/${open.id}`} className="h-[64vh] w-full rounded-lg border border-white/10 bg-white" />
          </>
        )}
      </Modal>
    </Card>
  );
}
