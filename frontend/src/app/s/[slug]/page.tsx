import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import StoreShell, { loadStore, type StoreData } from "@/components/store/StoreShell";
import { fmtMoney } from "@/lib/money";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadStore<StoreData>(encodeURIComponent((await params).slug));
  if (!data) return { title: "Store not found" };
  const { store } = data;
  return { title: store.name, description: store.tagline || `Shop ${store.name}${store.instagram ? ` (@${store.instagram})` : ""}`, openGraph: { images: data.products[0]?.image_url ? [data.products[0].image_url] : [] } };
}

/** Public storefront: every active product, linking to its own checkout page. */
export default async function StorePage({ params }: Props) {
  const { slug } = await params;
  const data = await loadStore<StoreData>(encodeURIComponent(slug));
  if (!data) notFound();
  const { store, products } = data;
  return (
    <StoreShell store={store}>
      {store.free_shipping_above !== null && store.shipping_fee > 0 && (
        <div className="mt-4 rounded-xl bg-pink-500/10 px-4 py-2 text-center text-[13px] text-pink-200">Free delivery on orders above {fmtMoney(store.free_shipping_above)}</div>
      )}
      {products.length === 0 ? (
        <div className="mt-16 text-center text-white/50"><ShoppingBag className="mx-auto mb-3" size={28} />New products are coming soon.</div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {products.map((p) => (
            <Link key={p.id} href={`/s/${store.slug}/p/${p.id}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition hover:border-pink-400/50">
              <div className="relative aspect-square bg-white/[0.06]">
                {p.image_url && <img src={p.image_url} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-[1.03]" loading="lazy" />}
                {p.sold_out && <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-semibold">Sold out</span>}
              </div>
              <div className="p-3">
                <div className="line-clamp-2 text-[13.5px] font-medium leading-snug">{p.name}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[15px] font-bold">{p.price_varies && <span className="text-[12px] font-normal text-white/50">From </span>}{fmtMoney(p.price)}</span>
                  {!p.price_varies && p.compare_at_price && p.compare_at_price > p.price && <span className="text-[12px] text-white/40 line-through">{fmtMoney(p.compare_at_price)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </StoreShell>
  );
}
