import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/store/Breadcrumb";
import ProductGrid from "@/components/store/ProductGrid";
import StoreShell, { loadStore, type StoreData } from "@/components/store/StoreShell";
import { categoriesOf, categoryHref } from "@/lib/store/categories";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadStore<StoreData>(encodeURIComponent((await params).slug));
  return { title: data ? `Shop all · ${data.store.name}` : "Store not found" };
}

/** Every product in the store, with a way into each category. */
export default async function ShopPage({ params }: Props) {
  const { slug } = await params;
  const data = await loadStore<StoreData>(encodeURIComponent(slug));
  if (!data) notFound();
  const { store, products } = data;
  const categories = categoriesOf(products);

  return (
    <StoreShell store={store} categories={categories.map((c) => c.name)}>
      <Breadcrumb items={[{ label: "Home", href: `/s/${store.slug}` }, { label: "All products" }]} />
      <h1 className="mt-3 text-[28px] font-bold tracking-tight sm:text-[34px]">{store.site.texts.all_products_title}</h1>
      {categories.length > 0 && (
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <span className="shrink-0 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)]">All</span>
          {categories.map((c) => (
            <Link key={c.name} href={categoryHref(store.slug, c.name)} className="shrink-0 rounded-full border border-[var(--line)] px-4 py-1.5 text-[13px] font-medium hover:border-[var(--muted)]">{c.name}</Link>
          ))}
        </div>
      )}
      <div className="mt-6">
        {products.length === 0 ? <div className="py-24 text-center text-[var(--muted)]">{store.site.texts.empty_store}</div> : <ProductGrid slug={store.slug} products={products} />}
      </div>
    </StoreShell>
  );
}
