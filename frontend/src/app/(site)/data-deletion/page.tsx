import Link from "next/link";
import { PageHero, Section } from "@/components/site/blocks";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Data Deletion",
  description: "Status of an Instagram data deletion request, and how to ask us to delete your data.",
  path: "/data-deletion",
  ogTitle: "GramForGrow data deletion",
  ogKind: "Legal",
});

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <>
      <PageHero breadcrumbs={[{ name: "Data deletion", path: "/data-deletion" }]} overline="Privacy" title="Data deletion"
        lead="When you remove GramForGrow from your Instagram account and ask for your data to be deleted, we erase it straight away." />
      <Section narrow>
        {code && (
          <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6 text-[14.5px] leading-relaxed text-white/70">
            <h2 className="mb-2 text-[16px] font-semibold text-white">Request completed</h2>
            <p>Confirmation code <code className="rounded bg-white/10 px-1.5 py-0.5 text-white">{code}</code>. The connected Instagram account, its access token, conversations, automations and scheduled posts have been deleted from our systems.</p>
          </div>
        )}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[14.5px] leading-relaxed text-white/60">
          <h2 className="mb-2 text-[16px] font-semibold text-white">How to request deletion</h2>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>On Instagram, open Settings → Website permissions → Apps and websites.</li>
            <li>Remove GramForGrow and choose to request deletion of your data.</li>
          </ol>
          <p className="mt-3">You can also disconnect the account from your dashboard, or <Link href="/contact?topic=support" className="text-brand hover:underline">contact us</Link> to delete your whole GramForGrow workspace. See our <Link href="/privacy" className="text-brand hover:underline">privacy policy</Link> for details.</p>
        </div>
      </Section>
    </>
  );
}
