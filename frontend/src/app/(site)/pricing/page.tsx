import { BadgeCheck, CreditCard, FileText, ShieldCheck } from "lucide-react";
import { CtaBand, FaqList, FeatureGrid, JsonLd, PageHero, Section } from "@/components/site/blocks";
import PricingTable from "@/components/site/PricingTable";
import { getPublicPricing } from "@/lib/site/livePlans";
import { inr } from "@/lib/site/plans";
import { pageMetadata, softwareLd, type Faq } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Pricing — Instagram Automation Plans in ₹",
  description: "Two simple plans for Instagram automation: Starter ₹799 and Growth ₹1,299 per month plus GST. Growth adds the Instagram Shop, giveaways, segments and the sales pipeline. Enterprise on request. Start with a free trial, pay with UPI or card, get GST invoices.",
  path: "/pricing",
  ogTitle: "Simple pricing, built for Indian businesses",
  ogKind: "Pricing",
  keywords: ["Instagram automation pricing", "comment to DM pricing India", "ManyChat alternative India", "Instagram DM tool price"],
});

const faqs = (days: number): Faq[] => [
  { q: "How does the free trial work?", a: `Every new workspace gets a ${days}-day free trial with no credit card. You get the core product — comment-to-DM, the DM inbox, keyword replies, flows and the AI agent — with a small number of comment automations. Analytics, reports, auto-assignment, API & webhooks and app integrations unlock on any paid plan; the Instagram Shop, giveaways, intent matching, segments and the sales pipeline unlock on Growth.` },
  { q: "What's the difference between Starter and Growth?", a: "Growth adds the Instagram Shop, giveaways, intent matching, segments and the sales pipeline, and gives you more Instagram accounts, team members, contacts, comment automations, flows and AI replies. Everything else is in both plans." },
  { q: "Are the prices inclusive of GST?", a: "No. Prices are shown before GST. 18% GST is added at checkout and shown on your invoice with a CGST/SGST or IGST breakup." },
  { q: "Do plans renew automatically?", a: "No. Plans are prepaid and don't auto-debit. We email you before your plan ends so you can renew when you're ready." },
  { q: "Are there per-message charges from Meta?", a: "No. Instagram messaging through the official API has no per-message fee from Meta. Your plan covers everything it includes: automations, inbox, AI and payments." },
  { q: "What payment methods can I use?", a: "UPI, credit and debit cards, netbanking and wallets through Razorpay. You'll get a GST invoice for every payment." },
  { q: "Can I change plans later?", a: "Yes. Upgrade or switch any time; the unused time on your current plan is credited toward the new one, shown before you pay." },
  { q: "Is there a money-back guarantee?", a: "If you're unhappy within 7 days of your first paid purchase, contact us and we'll refund it in full. See the refund policy for details." },
  { q: "What happens if my plan expires?", a: "After a short grace period your workspace moves to the free plan with lower limits and the advanced features lock again. Nothing is deleted — renew to restore everything." },
  { q: "What does Enterprise include?", a: "Custom limits, annual invoicing, guided onboarding and migration, a security review and a named account manager. Talk to us and we'll size it to your volume." },
];

// Re-render every 5 minutes so price changes made in the admin console reach this page without a redeploy.
export const revalidate = 300;

export default async function PricingPage() {
  const { plans, trial } = await getPublicPricing();
  const starter = plans.find((p) => p.id === "starter")?.perMonth?.monthly;
  const list = faqs(trial.days);
  return (
    <>
      <JsonLd data={softwareLd(plans.filter((p) => p.perMonth).map((p) => ({ name: p.name, price: p.perMonth!.monthly, description: p.audience })))} />
      <PageHero
        breadcrumbs={[{ name: "Pricing", path: "/pricing" }]}
        center
        overline="Pricing"
        title="Simple pricing that grows with your conversations"
        lead={`Start free for ${trial.days} days. Then ${starter ? `from ${inr(starter)} a month` : "pick a plan"} — Growth adds the Shop, pipeline and more room. Pay in rupees and get a GST invoice every time.`}
      />
      <Section>
        <PricingTable plans={plans} trial={trial} />
      </Section>
      <Section overline="Every plan includes" title="Built for how Indian businesses pay and sell" alt>
        <FeatureGrid cols={4} items={[
          { icon: CreditCard, title: "Pay your way", body: "UPI, cards, netbanking and wallets through Razorpay." },
          { icon: FileText, title: "GST invoices", body: "Sequential invoices with CGST + SGST or IGST and your GSTIN." },
          { icon: ShieldCheck, title: "Prepaid, no surprises", body: "No auto-debit. We remind you before your plan ends." },
          { icon: BadgeCheck, title: "Fair upgrades", body: "Unused time is credited when you move to a bigger plan." },
        ]} />
      </Section>
      <Section overline="FAQ" title="Pricing questions, answered" narrow>
        <FaqList faqs={list} />
      </Section>
      <CtaBand title="Need something bigger?" body="Custom limits, guided onboarding and a named contact for high-volume teams." primary={{ label: "Talk to sales", href: "/contact?topic=sales" }} secondary={{ label: "Start free trial", href: "/signup" }} />
    </>
  );
}
