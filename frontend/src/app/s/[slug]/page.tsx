import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, Instagram, MessageCircle, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { HeroCarousel, Rail, RailItem } from "@/components/store/Carousel";
import ProductCard from "@/components/store/ProductCard";
import StoreShell, { loadStore, type StoreData } from "@/components/store/StoreShell";
import type { PublicProduct } from "@/lib/api";
import { fmtMoney } from "@/lib/money";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadStore<StoreData>(encodeURIComponent((await params).slug));
  if (!data) return { title: "Store not found" };
  const { store } = data;
  const image = store.site.hero[0]?.image_url ?? data.products[0]?.image_url;
  return { title: store.name, description: store.tagline || `Shop ${store.name}${store.instagram ? ` (@${store.instagram})` : ""}`, openGraph: { images: image ? [image] : [] } };
}

/** The store's home page: hero carousel, trust badges, best sellers, new arrivals, all products, Instagram, about and FAQ. */
export default async function StorePage({ params }: Props) {
  const { slug } = await params;
  const data = await loadStore<StoreData>(encodeURIComponent(slug));
  if (!data) notFound();
  const { store, products } = data;
  const { site } = store;
  const t = site.texts;
  const byId = new Map(products.map((p) => [p.id, p]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is PublicProduct => !!p);
  const best = site.sections.best_sellers ? pick(data.best_sellers) : [];
  const fresh = site.sections.new_arrivals && products.length > 2 ? pick(data.new_arrivals) : [];
  const insta = site.sections.instagram && store.instagram ? products.filter((p) => p.image_url && p.permalink).slice(0, 6) : [];
  const badges = [
    store.free_shipping_above !== null && store.shipping_fee ? { icon: Truck, title: "Free delivery", text: `On orders above ${fmtMoney(store.free_shipping_above)}` }
      : !store.shipping_fee ? { icon: Truck, title: "Free delivery", text: "On every order" } : null,
    store.payment_methods.includes("cod") ? { icon: Banknote, title: "Cash on delivery", text: "Pay when it arrives" } : null,
    store.payment_methods.includes("online") ? { icon: ShieldCheck, title: "Secure payments", text: "UPI, cards & netbanking" } : null,
    store.instagram ? { icon: MessageCircle, title: "Order on Instagram", text: `DM @${store.instagram} anytime` } : null,
  ].filter((b) => b !== null);

  return (
    <StoreShell store={store} home>
      <HeroCarousel slides={site.hero} slug={store.slug} storeName={store.name} buttonLabel={t.hero_button} />

      {badges.length > 0 && (
        <section className="border-b border-[var(--line)]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 lg:grid-cols-4">
            {badges.map((b) => (
              <div key={b.title} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))] text-[var(--accent)]"><b.icon size={18} /></span>
                <span><span className="block text-[13.5px] font-semibold">{b.title}</span><span className="block text-[12px] text-[var(--muted)]">{b.text}</span></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {products.length === 0 ? (
        <div className="py-24 text-center text-[var(--muted)]"><ShoppingBag className="mx-auto mb-3" size={30} />{t.empty_store}</div>
      ) : (
        <>
          {best.length > 0 && <Rail title={t.best_sellers_title} subtitle={t.best_sellers_subtitle}>{best.map((p) => <RailItem key={p.id}><ProductCard slug={store.slug} product={p} /></RailItem>)}</Rail>}
          {fresh.length > 0 && <Rail title={t.new_arrivals_title} subtitle={t.new_arrivals_subtitle}>{fresh.map((p) => <RailItem key={p.id}><ProductCard slug={store.slug} product={p} /></RailItem>)}</Rail>}

          {(site.sections.all_products || (!best.length && !fresh.length)) && (
            <section id="products" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-14">
              <div className="mb-5 flex items-end justify-between">
                <h2 className="text-[22px] font-bold tracking-tight sm:text-[26px]">{t.all_products_title}</h2>
                <span className="text-[13px] text-[var(--muted)]">{products.length} product{products.length === 1 ? "" : "s"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {products.map((p) => <ProductCard key={p.id} slug={store.slug} product={p} />)}
              </div>
            </section>
          )}
        </>
      )}

      {insta.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-bold tracking-tight sm:text-[26px]">{t.instagram_title}</h2>
              <p className="mt-1 text-[14px] text-[var(--muted)]">{t.instagram_subtitle}</p>
            </div>
            <a href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-[13.5px] font-medium hover:border-[var(--muted)]">
              <Instagram size={15} /> Follow @{store.instagram}
            </a>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {insta.map((p) => (
              <Link key={p.id} href={`/s/${store.slug}/p/${p.id}`} className="group relative aspect-square overflow-hidden rounded-lg bg-[var(--soft)]">
                <img src={p.image_url!} alt={p.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"><Instagram size={22} /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {site.sections.about && site.about.text && (
        <section id="about" className="mx-auto mt-16 max-w-6xl scroll-mt-20 px-4">
          <div className="grid items-center gap-8 overflow-hidden rounded-3xl bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg))] md:grid-cols-2">
            {site.about.image_url && <img src={site.about.image_url} alt="" className="h-full max-h-[420px] w-full object-cover" />}
            <div className={`p-8 sm:p-10 ${site.about.image_url ? "" : "md:col-span-2"}`}>
              <h2 className="text-[24px] font-bold tracking-tight sm:text-[30px]">{site.about.title || `About ${store.name}`}</h2>
              <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-[var(--muted)]">{site.about.text}</p>
            </div>
          </div>
        </section>
      )}

      {site.sections.faq && site.faq.length > 0 && (
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-16">
          <h2 className="mb-5 text-center text-[22px] font-bold tracking-tight sm:text-[26px]">{t.faq_title}</h2>
          <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
            {site.faq.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
                  {f.q}<span className="text-[20px] leading-none text-[var(--faint)] transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-[var(--muted)]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </StoreShell>
  );
}
