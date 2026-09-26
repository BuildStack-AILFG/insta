import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/blocks";
import { SOLUTIONS } from "@/lib/site/solutions";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Solutions — Instagram Automation for Every Industry",
  description: "See how D2C brands, creators, salons, educators, restaurants, real estate, agencies and travel businesses use Instagram automation to turn comments and DMs into customers.",
  path: "/solutions",
  ogTitle: "Instagram automation for your industry",
  ogKind: "Solutions",
  keywords: ["Instagram automation use cases", "Instagram DM automation by industry"],
});

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        breadcrumbs={[{ name: "Solutions", path: "/solutions" }]}
        overline="Solutions"
        title="Playbooks for the way your industry actually sells and supports"
        lead="Every business talks to customers differently. Start from a proven approach for yours and adapt it in an afternoon."
        actions={<Link href="/contact?topic=demo" className={M.btnPrimary}>Book a demo <ArrowRight size={16} /></Link>}
      />
      <Section>
        <FeatureGrid items={SOLUTIONS.map((s) => ({ icon: s.icon, title: s.navLabel, body: s.tagline, href: `/solutions/${s.slug}` }))} cols={4} />
      </Section>
      <CtaBand title="Don't see your industry?" body="Instagram automation works anywhere people comment, ask and buy. Tell us about your business and we'll suggest a set-up." secondary={{ label: "Contact us", href: "/contact" }} />
    </>
  );
}
