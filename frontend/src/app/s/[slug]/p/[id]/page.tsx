import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banknote, Instagram, ShieldCheck, Truck } from "lucide-react";
import { Gallery, Rail, RailItem } from "@/components/store/Carousel";
import ProductBuy from "@/components/store/ProductBuy";
import PriceBlock from "@/components/store/PriceBlock";
import ProductCard from "@/components/store/ProductCard";
import StoreShell, { loadStore, type ProductData, type StoreData } from "@/components/store/StoreShell";
import Breadcrumb from "@/components/store/Breadcrumb";
import { fmtMoney } from "@/lib/money";
import { categoriesOf, categoryHref } from "@/lib/store/categories";

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

async function load(slug: string, id: string) {
  return /^[0-9a-f-]{36}$/i.test(id) ? loadStore<ProductData>(`${encodeURIComponent(slug)}/products/${id}`) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const data = await load(slug, id);
  if (!data) return { title: "Product not found" };
  const { store, product } = data;
  return { title: `${product.name} · ${store.name}`, description: product.description.slice(0, 160) || `${fmtMoney(product.price)} at ${store.name}`,
    openGraph: { images: product.images.slice(0, 1) } };
}

/** One product: photo carousel, options, add to cart / buy now, and more from the store. `?r=` is the signed ref from a comment-automation DM. */
export default async function ProductPage({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const r = (await searchParams).r;
  const [data, all] = await Promise.all([load(slug, id), loadStore<StoreData>(encodeURIComponent(slug))]);
  if (!data) notFound();
  const { store, product, related } = data;
  const buyable = !product.sold_out && store.payment_methods.length > 0;  // ProductBuy shows the live price
  const perks = [
    store.payment_methods.includes("cod") && { icon: Banknote, text: "Cash on delivery available" },
    store.payment_methods.includes("online") && { icon: ShieldCheck, text: "Secure UPI & card payments" },
    { icon: Truck, text: !store.shipping_fee ? "Free delivery" : store.free_shipping_above !== null ? `Free delivery above ${fmtMoney(store.free_shipping_above)}` : `Delivery ${fmtMoney(store.shipping_fee)}` },
  ].filter((x) => !!x);

  return (
    <StoreShell store={store} categories={categoriesOf(all?.products ?? []).map((c) => c.name)}>
      <Breadcrumb items={[{ label: "Home", href: `/s/${store.slug}` },
        ...(product.category ? [{ label: product.category, href: categoryHref(store.slug, product.category) }] : [{ label: "Shop", href: `/s/${store.slug}/shop` }]),
        { label: product.name }]} />
      <div className="mt-4 grid gap-10 md:grid-cols-2">
        <Gallery images={product.images} alt={product.name} />
        <div className="md:pt-2">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">{product.name}</h1>
          {!buyable && <PriceBlock price={product.price} from={product.price_varies} compareAt={product.price_varies ? null : product.compare_at_price} />}

          <div className={buyable ? "mt-0" : "mt-6"}>
            {product.sold_out
              ? <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-center text-[14px] text-[var(--muted)]">Sold out — check back soon!</div>
              : <ProductBuy store={store} product={product} refToken={typeof r === "string" ? r : undefined} />}
          </div>

          <ul className="mt-6 space-y-2 border-t border-[var(--line)] pt-5 text-[13.5px] text-[var(--fg)]">
            {perks.map((p) => <li key={p.text} className="flex items-center gap-2.5"><p.icon size={16} className="text-[var(--accent)]" /> {p.text}</li>)}
          </ul>

          {product.description && product.description !== product.name && (
            <div className="mt-6 border-t border-[var(--line)] pt-5">
              <h2 className="mb-2 text-[14px] font-semibold">Details</h2>
              <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-[var(--muted)]">{product.description}</p>
            </div>
          )}
          {product.permalink && (
            <a href={product.permalink} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--fg)]">
              <Instagram size={14} /> See it on Instagram
            </a>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <div className="-mx-4">
          <Rail title={store.site.texts.related_title}>{related.map((p) => <RailItem key={p.id}><ProductCard slug={store.slug} product={p} /></RailItem>)}</Rail>
        </div>
      )}
    </StoreShell>
  );
}
