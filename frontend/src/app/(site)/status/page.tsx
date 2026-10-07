import Link from "next/link";
import { PageHero, Section } from "@/components/site/blocks";
import StatusBoard from "@/components/site/StatusBoard";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "System Status",
  description: "Live health of the DMForGrow website, API and database, checked in real time.",
  path: "/status",
  ogTitle: "DMForGrow system status",
  ogKind: "Status",
});

export default function StatusPage() {
  return (
    <>
      <PageHero breadcrumbs={[{ name: "System status", path: "/status" }]} overline="Status" title="System status" lead="These checks run live against our servers each time you open this page." />
      <Section narrow>
        <StatusBoard />
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[14.5px] leading-relaxed text-white/60">
          <h2 className="mb-2 text-[16px] font-semibold text-white">About Instagram delivery</h2>
          <p>Comments and DMs travel through Meta&apos;s Instagram API. If Instagram itself is degraded, delivery can be delayed even when our systems are healthy — check Meta&apos;s own status page for platform incidents. If you see a problem that isn&apos;t reflected here, please <Link href="/contact?topic=support" className="text-brand hover:underline">tell us</Link>.</p>
        </div>
      </Section>
    </>
  );
}
