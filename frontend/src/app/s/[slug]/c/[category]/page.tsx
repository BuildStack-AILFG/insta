import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/store/Breadcrumb";
import ProductGrid from "@/components/store/ProductGrid";
import StoreShell, { loadStore, type StoreData } from "@/components/store/StoreShell";
import { categoriesOf, categoryHref } from "@/lib/store/categories";

type Props = { params: Promise<{ slug: string; category: string }> };

const nameOf = (raw: string) => { try { return decodeURIComponent(raw); } catch { return raw; } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, category } = await params;
  const data = await loadStore<StoreData>(encodeURIComponent(slug));
  if (!data) return { title: "Store not found" };
  return { title: `${nameOf(category)} · ${data.store.name}`, description: `Shop ${nameOf(category)} at ${data.store.name}` };
}

/** One category: its own page with a breadcrumb, item count, sort and the products in it. */
export default async function CategoryPage({ params }: Props) {
  const { slug, category: raw } = await params;
  const category = nameOf(raw);
  const data = await loadStore<StoreData>(encodeURIComponent(slug));
  if (!data) notFound();
  const { store, products } = data;
  const categories = categoriesOf(products);
  const inCategory = products.filter((p) => p.category === category);
  if (inCategory.length === 0) notFound();

  return (
    <StoreShell store={store} categories={categories.map((c) => c.name)}>
      <Breadcrumb items={[{ label: "Home", href: `/s/${store.slug}` }, { label: "Shop", href: `/s/${store.slug}/shop` }, { label: category }]} />
      <h1 className="mt-3 text-[28px] font-bold tracking-tight sm:text-[34px]">{category}</h1>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={`/s/${store.slug}/shop`} className="shrink-0 rounded-full border border-[var(--line)] px-4 py-1.5 text-[13px] font-medium hover:border-[var(--muted)]">All</Link>
        {categories.map((c) => (
          <Link key={c.name} href={categoryHref(store.slug, c.name)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-[13px] font-medium ${c.name === category ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--line)] hover:border-[var(--muted)]"}`}>{c.name}</Link>
        ))}
      </div>
      <div className="mt-6"><ProductGrid slug={store.slug} products={inCategory} /></div>
    </StoreShell>
  );
}
