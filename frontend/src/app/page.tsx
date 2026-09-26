import HomeClient from "@/components/landing/HomeClient";
import { JsonLd } from "@/components/site/blocks";
import HomePricingSection from "@/components/landing/HomePricingSection";
import { getPublicPricing } from "@/lib/site/livePlans";
import { pageMetadata, softwareLd } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "GramForGrow — Instagram Comment-to-DM Automation, DM Inbox & AI Replies",
  description:
    "Turn Instagram comments into customers: auto-reply to comments, DM everyone who comments a keyword, answer story replies, run a shared DM inbox and an AI agent — on Meta's official Instagram API.",
  path: "/",
  ogTitle: "Instagram automation that turns comments into sales",
  ogKind: "",
  keywords: ["Instagram DM automation", "comment to DM", "Instagram auto reply", "Instagram comment automation", "ManyChat alternative", "Instagram chatbot India"],
});

// Re-render every 5 minutes so price changes made in the admin console reach the home page without a redeploy.
export const revalidate = 300;

export default async function Home() {
  const { plans } = await getPublicPricing();
  return (
    <>
      <JsonLd data={softwareLd(plans.filter((p) => p.perMonth).map((p) => ({ name: p.name, price: p.perMonth!.monthly, description: p.audience })))} />
      <HomeClient pricing={<HomePricingSection />} />
    </>
  );
}
