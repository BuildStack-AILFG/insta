import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoreHome from "@/components/store/StoreHome";
import { loadStore, type StoreData } from "@/components/store/StoreShell";
import { withSamples } from "@/lib/store/sample";
import { isTemplateId, previewStore } from "@/lib/store/templates";

type Props = { params: Promise<{ slug: string; tpl: string }> };

export const metadata: Metadata = { title: "Template preview", robots: { index: false, follow: false } };

/**
 * The store's own home page in another template's look — what the Website tab's "Preview" shows. Nothing is saved. A store with few products
 * or no banner gets clearly-labelled sample content so the design can be judged properly.
 */
export default async function TemplatePreviewPage({ params }: Props) {
  const { slug, tpl } = await params;
  if (!isTemplateId(tpl)) notFound();
  const loaded = await loadStore<StoreData>(encodeURIComponent(slug));
  if (!loaded) notFound();
  const { data, filled } = withSamples({ ...loaded, store: previewStore(loaded.store, tpl) }, tpl);
  return (
    <>
      <StoreHome data={data} />
      {filled && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <span className="rounded-full bg-black/80 px-4 py-2 text-[12.5px] text-white shadow-lg">Sample products and photos are shown so you can see the full design — yours replace them.</span>
        </div>
      )}
    </>
  );
}
