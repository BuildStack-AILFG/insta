import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CtaBand, FeatureGrid, JsonLd, PageHero, Section } from "@/components/site/blocks";
import { FEATURES } from "@/lib/site/features";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { absoluteUrl } from "@/lib/site/config";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Features — Comment to DM, DM Inbox, Flows, AI & Sales",
  description: "Everything you need to grow on Instagram: comment-to-DM, story automation, a shared DM inbox, flows, lead capture, AI agent, sales pipeline, payments and integrations.",
  path: "/features",
  ogTitle: "Every tool your Instagram team needs",
  ogKind: "Features",
  keywords: ["Instagram automation features", "comment to DM tool", "Instagram DM CRM"],
});

export default function FeaturesPage() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ItemList", name: "DMForGrow features", itemListElement: FEATURES.map((f, i) => ({ "@type": "ListItem", position: i + 1, name: f.navLabel, url: absoluteUrl(`/features/${f.slug}`) })) }} />
      <PageHero
        breadcrumbs={[{ name: "Features", path: "/features" }]}
        overline="The platform"
        title="One workspace for every comment, DM and sale"
        lead="From the first comment to the final payment. Every feature works together, on Meta's official Instagram API, so your team never has to switch tools."
        actions={<><Link href="/signup" className={M.btnPrimary}>Start free trial <ArrowRight size={16} /></Link><Link href="/pricing" className={M.btnOutline}>See pricing</Link></>}
      />
      <Section overline="Explore" title="Pick a capability to see how it works">
        <FeatureGrid items={FEATURES.map((f) => ({ icon: f.icon, title: f.navLabel, body: f.tagline, href: `/features/${f.slug}` }))} />
      </Section>
      <CtaBand />
    </>
  );
}
