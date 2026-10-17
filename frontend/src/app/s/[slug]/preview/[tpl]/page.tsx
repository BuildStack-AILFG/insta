import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoreHome from "@/components/store/StoreHome";
import { loadStore, type StoreData } from "@/components/store/StoreShell";
import { isTemplateId, previewStore } from "@/lib/store/templates";

type Props = { params: Promise<{ slug: string; tpl: string }> };

export const metadata: Metadata = { title: "Template preview", robots: { index: false, follow: false } };

/** The store's own home page in another template's look — what the Website tab's "Preview" shows. Nothing is saved or counted as a sale. */
export default async function TemplatePreviewPage({ params }: Props) {
  const { slug, tpl } = await params;
  if (!isTemplateId(tpl)) notFound();
  const data = await loadStore<StoreData>(encodeURIComponent(slug));
  if (!data) notFound();
  return <StoreHome data={{ ...data, store: previewStore(data.store, tpl) }} />;
}
