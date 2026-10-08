import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoreShell, { loadStore, type StoreData } from "@/components/store/StoreShell";
import CartView from "@/components/store/CartView";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadStore<StoreData>(encodeURIComponent((await params).slug));
  return { title: data ? `Cart · ${data.store.name}` : "Store not found", robots: { index: false } };
}

/** The cart and its checkout. The cart itself lives in the buyer's browser. */
export default async function CartPage({ params }: Props) {
  const data = await loadStore<StoreData>(encodeURIComponent((await params).slug));
  if (!data) notFound();
  return <StoreShell store={data.store}><CartView store={data.store} /></StoreShell>;
}
