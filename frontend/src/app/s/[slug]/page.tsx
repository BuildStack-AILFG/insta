import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoreHome from "@/components/store/StoreHome";
import { loadStore, type StoreData } from "@/components/store/StoreShell";

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
  return <StoreHome data={data} />;
}
