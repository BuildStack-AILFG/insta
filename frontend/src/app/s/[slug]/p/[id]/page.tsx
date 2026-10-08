import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Instagram } from "lucide-react";
import StoreShell, { loadStore, type ProductData } from "@/components/store/StoreShell";
import ProductBuy from "@/components/store/ProductBuy";
import { fmtMoney } from "@/lib/money";

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
    openGraph: { images: product.image_url ? [product.image_url] : [] } };
}

/** One product with its checkout. `?r=` is the signed ref from a comment-automation DM, so the sale is credited to that automation. */
export default async function ProductPage({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const r = (await searchParams).r;
  const data = await load(slug, id);
  if (!data) notFound();
  const { store, product } = data;
  const off = !product.price_varies && product.compare_at_price && product.compare_at_price > product.price
    ? Math.round(100 - (100 * product.price) / product.compare_at_price) : 0;
  return (
    <StoreShell store={store}>
      <Link href={`/s/${store.slug}`} className="mt-4 inline-flex items-center gap-1 text-[13px] text-white/55 hover:text-white"><ArrowLeft size={14} /> All products</Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-2xl bg-white/[0.06]">
            {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full object-cover" /> : <div className="aspect-square" />}
          </div>
          {product.permalink && (
            <a href={product.permalink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-pink-300 hover:underline">
              <Instagram size={13} /> See the post on Instagram
            </a>
          )}
        </div>
        <div>
          <h1 className="text-[22px] font-bold leading-tight">{product.name}</h1>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[24px] font-bold">{product.price_varies && <span className="text-[15px] font-normal text-white/55">From </span>}{fmtMoney(product.price)}</span>
            {off > 0 && <><span className="text-[15px] text-white/40 line-through">{fmtMoney(product.compare_at_price!)}</span><span className="text-[13px] font-semibold text-emerald-300">{off}% off</span></>}
          </div>
          {product.description && product.description !== product.name && <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-white/70">{product.description}</p>}
          <div className="mt-6">
            {product.sold_out
              ? <div className="rounded-xl border border-white/15 px-4 py-3 text-center text-[14px] text-white/70">Sold out — check back soon!</div>
              : <ProductBuy store={store} product={product} refToken={typeof r === "string" ? r : undefined} />}
          </div>
        </div>
      </div>
    </StoreShell>
  );
}
