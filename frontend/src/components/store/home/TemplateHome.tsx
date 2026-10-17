import Link from "next/link";
import { Instagram } from "lucide-react";
import { HeroCarousel, Rail, RailItem } from "../Carousel";
import CategoryTiles from "../CategoryTiles";
import ProductCard from "../ProductCard";
import StoreShell, { type StoreData } from "../StoreShell";
import type { PublicProduct } from "@/lib/api";
import { categoriesOf } from "@/lib/store/categories";
import { isSample } from "@/lib/store/sample";
import { getTemplate, homeOrder } from "@/lib/store/templates";
import { Benefits, CollectionTiles, CustomOrder, Lookbook, ProductGridSection, SectionHead, Steps, Story, Testimonials } from "./blocks";
import Reveal from "./Reveal";

function Faq({ data }: { data: StoreData }) {
  const { site } = data.store;
  if (!site.sections.faq || !site.faq.length) return null;
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-16">
      <SectionHead title={site.texts.faq_title} center />
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
  );
}

function InstaStrip({ data }: { data: StoreData }) {
  const { store, products } = data;
  const t = store.site.texts;
  const insta = store.site.sections.instagram && store.instagram ? products.filter((p) => p.image_url && p.permalink).slice(0, 6) : [];
  if (!insta.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-[24px] font-bold tracking-tight sm:text-[30px]">{t.instagram_title}</h2><p className="mt-1 text-[14px] text-[var(--muted)]">{t.instagram_subtitle}</p></div>
        <a href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-[13.5px] font-medium hover:border-[var(--muted)]"><Instagram size={15} /> Follow @{store.instagram}</a>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {insta.map((p) => (
          <Link key={p.id} href={isSample(p.id) ? "#" : `/s/${store.slug}/p/${p.id}`} className="group relative aspect-square overflow-hidden bg-[var(--soft)]">
            <img src={p.image_url!} alt={p.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
          </Link>
        ))}
      </div>
    </section>
  );
}

/** The home page of a niche template: each one is composed from different blocks in a different order (see lib/store/templates.ts). */
export default function TemplateHome({ data }: { data: StoreData }) {
  const { store, products } = data;
  const { site } = store;
  const t = site.texts;
  const tpl = getTemplate(site.template);
  const byId = new Map(products.map((p) => [p.id, p]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is PublicProduct => !!p);
  const best = site.sections.best_sellers ? pick(data.best_sellers) : [];
  const fresh = site.sections.new_arrivals ? pick(data.new_arrivals) : [];
  const categories = categoriesOf(products, data.category_images);
  const showCollections = site.sections.categories && categories.length > 0;
  const rail = (title: string, subtitle: string | undefined, items: PublicProduct[]) =>
    items.length > 0 && <Rail title={title} subtitle={subtitle}>{items.map((p) => <RailItem key={p.id}><ProductCard slug={store.slug} product={p} /></RailItem>)}</Rail>;
  const allLink = site.sections.all_products && (
    <Link href={`/s/${store.slug}/shop`} className="text-[13.5px] font-medium text-[var(--accent)] hover:underline">{t.all_products_title} →</Link>
  );

  const sections: Record<string, React.ReactNode> = {
    lookbook: site.sections.all_products && <Lookbook slug={store.slug} products={[...best, ...products]} title={t.lookbook_title} subtitle={t.lookbook_subtitle} />,
    collections: showCollections && <CollectionTiles slug={store.slug} products={products} covers={data.category_images} title={t.categories_title} columns={tpl.id === "jewellery" ? 2 : 3} />,
    tiles: showCollections && <CategoryTiles slug={store.slug} title={t.categories_title} products={products} covers={data.category_images} />,
    signature: site.sections.all_products && <ProductGridSection slug={store.slug} products={best.length ? best : products} title={t.best_sellers_title} subtitle={t.best_sellers_subtitle} action={allLink} />,
    best: rail(t.best_sellers_title, t.best_sellers_subtitle, best),
    fresh: rail(t.new_arrivals_title, t.new_arrivals_subtitle, fresh),
    benefits: <Benefits store={store} />,
    steps: <Steps title={t.steps_title} steps={[
      { title: t.step1_title, text: t.step1_text },
      { title: t.step2_title, text: t.step2_text },
      { title: t.step3_title, text: t.step3_text },
    ]} />,
    custom: <CustomOrder store={store} title={t.custom_title} text={t.custom_text} label={t.custom_button === "Request on Instagram" && !store.instagram ? "Request on WhatsApp" : t.custom_button} />,
    story: <Story store={store} flip={tpl.id === "boutique"} />,
    testimonials: site.sections.testimonials && (site.testimonials?.length ?? 0) > 0 && <Testimonials items={site.testimonials} title={t.testimonials_title} />,
    insta: <InstaStrip data={data} />,
    faq: <Faq data={data} />,
    all: site.sections.all_products && products.length > 0 && (
      <div className="mt-12 text-center"><Link href={`/s/${store.slug}/shop`} className="inline-flex items-center rounded-full bg-[var(--accent)] px-7 py-3 text-[14px] font-semibold text-[var(--accent-fg)] hover:opacity-90">Shop all {products.length} products</Link></div>
    ),
  };
  const order = homeOrder(tpl.id, site.section_order);

  return (
    <StoreShell store={store} home categories={categories.map((c) => c.name)}>
      <HeroCarousel slides={site.hero} slug={store.slug} storeName={store.name} tagline={store.tagline} buttonLabel={t.hero_button} layout={tpl.hero} template={tpl.id} />
      {products.length === 0
        ? <div className="py-24 text-center text-[var(--muted)]">{t.empty_store}</div>
        : order.map((key, i) => (sections[key] ? <Reveal key={key} className={i === 0 ? "" : undefined}>{sections[key]}</Reveal> : null))}
    </StoreShell>
  );
}
