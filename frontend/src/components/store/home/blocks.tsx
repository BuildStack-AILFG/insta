import Link from "next/link";
import { Banknote, Instagram, MessageCircle, ShieldCheck, Truck } from "lucide-react";
import type { PublicProduct, PublicStore } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { categoriesOf, categoryHref } from "@/lib/store/categories";
import { isSample } from "@/lib/store/sample";
import { whatsappUrl } from "../StoreShell";
import ProductCard from "../ProductCard";

const href = (slug: string, p: PublicProduct) => (isSample(p.id) ? "#" : `/s/${slug}/p/${p.id}`);

export function SectionHead({ title, subtitle, action, center = false }: { title: string; subtitle?: string; action?: React.ReactNode; center?: boolean }) {
  return (
    <div className={`mb-6 flex flex-wrap items-end gap-4 ${center ? "justify-center text-center" : "justify-between"}`}>
      <div>
        <h2 className="text-[24px] font-bold tracking-tight sm:text-[30px]">{title}</h2>
        {subtitle && <p className="mt-1 max-w-xl text-[14px] text-[var(--muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Fashion: an editorial collage of the store's best photos (one tall picture beside a stack), each linking to its product. */
export function Lookbook({ slug, products, title, subtitle }: { slug: string; products: PublicProduct[]; title: string; subtitle?: string }) {
  const pics = products.filter((p) => p.image_url).slice(0, 4);
  if (pics.length < 3) return null;
  const tile = (p: PublicProduct, cls: string) => (
    <Link key={p.id} href={href(slug, p)} className={`group relative block overflow-hidden bg-[var(--soft)] ${cls}`}>
      <img src={p.image_url!} alt={p.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 text-white">
        <span className="block text-[15px] font-medium">{p.name}</span><span className="text-[13px] text-white/85">{fmtMoney(p.price)}</span>
      </span>
    </Link>
  );
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <SectionHead title={title} subtitle={subtitle} />
      <div className="grid gap-3 md:grid-cols-[1.25fr_1fr] md:grid-rows-2">
        {tile(pics[0], "aspect-[4/5] md:row-span-2 md:aspect-auto md:min-h-[560px]")}
        {tile(pics[1], "aspect-[16/10]")}
        <div className="grid grid-cols-2 gap-3">
          {tile(pics[2], "aspect-[4/5]")}
          {pics[3] ? tile(pics[3], "aspect-[4/5]") : <div className="bg-[var(--surface)]" />}
        </div>
      </div>
    </section>
  );
}

/** Jewellery / beauty: big photo tiles for each category, linking to its page. */
export function CollectionTiles({ slug, products, covers, title, subtitle, columns = 3 }: { slug: string; products: PublicProduct[]; covers?: Record<string, string>; title: string; subtitle?: string; columns?: 2 | 3 }) {
  const tiles = categoriesOf(products, covers).slice(0, columns === 2 ? 4 : 6);
  if (!tiles.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <SectionHead title={title} subtitle={subtitle} />
      <div className={`grid gap-3 sm:gap-4 ${columns === 2 ? "sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
        {tiles.map((t) => (
          <Link key={t.name} href={categoryHref(slug, t.name)} className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--soft)]">
            {t.image && <img src={t.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]" />}
            <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
              <span className="block text-[18px] font-semibold tracking-wide sm:text-[22px]">{t.name}</span>
              <span className="text-[12.5px] text-white/85">{t.count} piece{t.count === 1 ? "" : "s"} →</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** A plain grid of the first products (jewellery "Signature pieces"). */
export function ProductGridSection({ slug, products, title, subtitle, limit = 8, action }: { slug: string; products: PublicProduct[]; title: string; subtitle?: string; limit?: number; action?: React.ReactNode }) {
  if (!products.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <SectionHead title={title} subtitle={subtitle} action={action} />
      <div className="pgrid grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-4">{products.slice(0, limit).map((p) => <ProductCard key={p.id} slug={slug} product={p} />)}</div>
    </section>
  );
}

/** Bakery: how ordering works, in three steps. */
export function Steps({ title, steps }: { title: string; steps: { title: string; text: string }[] }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <SectionHead title={title} center />
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-2xl bg-[var(--surface)] p-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[15px] font-bold text-[var(--accent-fg)]">{i + 1}</span>
            <h3 className="mt-4 text-[17px] font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Bakery: a custom-order call to action that opens the store's Instagram DMs or WhatsApp. */
export function CustomOrder({ store, title, text, label }: { store: PublicStore; title: string; text: string; label: string }) {
  const wa = store.support_phone ? whatsappUrl(store.support_phone) : null;
  const link = store.instagram ? `https://ig.me/m/${store.instagram}` : wa;
  if (!link) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <div className="flex flex-col items-start justify-between gap-5 overflow-hidden rounded-3xl bg-[var(--accent)] p-8 text-[var(--accent-fg)] sm:flex-row sm:items-center sm:p-10">
        <div className="max-w-xl">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[30px]">{title}</h2>
          <p className="mt-2 text-[15px] opacity-90">{text}</p>
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--bg)] px-6 py-3 text-[14.5px] font-semibold text-[var(--fg)] shadow-sm transition hover:opacity-90">
          {store.instagram ? <Instagram size={16} /> : <MessageCircle size={16} />} {label}
        </a>
      </div>
    </section>
  );
}

/** Beauty: up to four reassurance points taken from the store's own settings (never invented claims). */
export function Benefits({ store }: { store: PublicStore }) {
  const items = [
    { icon: Truck, title: !store.shipping_fee || store.free_shipping_above !== null ? "Free delivery" : "Delivered to you", text: !store.shipping_fee ? "On every order" : store.free_shipping_above !== null ? `On orders above ${fmtMoney(store.free_shipping_above)}` : `Flat ${fmtMoney(store.shipping_fee)} shipping` },
    store.payment_methods.includes("cod") && { icon: Banknote, title: "Cash on delivery", text: "Pay when it arrives" },
    store.payment_methods.includes("online") && { icon: ShieldCheck, title: "Secure payments", text: "UPI, cards & netbanking" },
    store.instagram && { icon: MessageCircle, title: "Ask us anything", text: `DM @${store.instagram} for advice` },
  ].filter((b) => !!b).slice(0, 4) as { icon: typeof Truck; title: string; text: string }[];
  return (
    <section className="mt-10 border-y border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 lg:grid-cols-4">
        {items.map((b) => (
          <div key={b.title} className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--accent)]"><b.icon size={20} /></span>
            <span><span className="block text-[14.5px] font-semibold">{b.title}</span><span className="text-[13px] text-[var(--muted)]">{b.text}</span></span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The seller's story with a big photo beside it (falls back to a text-only band). */
export function Story({ store, flip = false }: { store: PublicStore; flip?: boolean }) {
  const { site } = store;
  if (!site.sections.about || !site.about.text) return null;
  const img = site.about.image_url;
  return (
    <section id="about" className="mx-auto mt-16 max-w-6xl scroll-mt-20 px-4">
      <div className={`grid items-center gap-8 overflow-hidden rounded-3xl bg-[var(--surface)] ${img ? "md:grid-cols-2" : ""}`}>
        {img && <img src={img} alt="" loading="lazy" className={`h-full max-h-[480px] w-full object-cover ${flip ? "md:order-2" : ""}`} />}
        <div className="p-8 sm:p-12">
          <h2 className="text-[26px] font-bold tracking-tight sm:text-[34px]">{site.about.title || `About ${store.name}`}</h2>
          <p className="mt-4 whitespace-pre-line text-[15.5px] leading-relaxed text-[var(--muted)]">{site.about.text}</p>
        </div>
      </div>
    </section>
  );
}

/** Reviews the seller wrote themselves (Website tab → Customer reviews). */
export function Testimonials({ items, title = "What customers say" }: { items: { name: string; text: string }[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <SectionHead title={title} center />
      <div className={`grid gap-4 ${items.length === 1 ? "mx-auto max-w-xl" : items.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {items.map((t, i) => (
          <figure key={`${t.name}-${i}`} className="rounded-2xl bg-[var(--surface)] p-6">
            <div role="img" aria-label="5 out of 5 stars" className="text-[15px] tracking-[0.2em] text-[var(--accent)]">★★★★★</div>
            <blockquote className="mt-3 text-[15px] leading-relaxed">&ldquo;{t.text}&rdquo;</blockquote>
            <figcaption className="mt-4 flex items-center gap-3 text-[13.5px] font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[13px] text-[var(--accent-fg)]">{t.name.slice(0, 1).toUpperCase()}</span>{t.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
