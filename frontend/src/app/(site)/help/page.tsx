import Link from "next/link";
import { BookOpen, LifeBuoy, MessageCircle } from "lucide-react";
import { JsonLd, LinkCard, PageHero, Section } from "@/components/site/blocks";
import HelpCenter from "@/components/site/HelpCenter";
import { allHelpFaqs } from "@/lib/site/help";
import { whatsappLink } from "@/lib/site/config";
import { faqLd, pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Help Center — Answers About Accounts, Instagram, Billing & More",
  description: "Find answers about connecting Instagram, comment automations, flows, AI, GST invoices, plans and privacy. Search the GramForGrow Help Center or contact support.",
  path: "/help",
  ogTitle: "How can we help?",
  ogKind: "Help",
  keywords: ["GramForGrow help", "Instagram automation help", "comment to DM help"],
});

export default function HelpPage() {
  return (
    <>
      <JsonLd data={faqLd(allHelpFaqs().map(({ q, a }) => ({ q, a })))} />
      <PageHero breadcrumbs={[{ name: "Help Center", path: "/help" }]} center overline="Help Center" title="How can we help?" lead="Search answers to common questions, browse the documentation or talk to a person." />
      <Section><HelpCenter /></Section>
      <Section overline="Still stuck?" title="We're here to help" alt>
        <div className="grid gap-4 md:grid-cols-3">
          <LinkCard href="/docs" icon={BookOpen} title="Read the docs" body="Step-by-step guides and the API reference." />
          <LinkCard href="/contact?topic=support" icon={LifeBuoy} title="Contact support" body="Send us the details and we'll get back to you." />
          <a href={whatsappLink("Hi, I need help with GramForGrow")} target="_blank" rel="noopener noreferrer" className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-brand/40 hover:bg-white/[0.06]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand"><MessageCircle size={20} /></span>
            <span className="mt-3 text-[16px] font-semibold text-white">Chat with support on WhatsApp</span>
            <span className="mt-1.5 flex-1 text-[14px] text-white/60">The fastest way to reach our team.</span>
            <span className="mt-3 text-[13.5px] font-medium text-brand">Start a chat →</span>
          </a>
        </div>
        <p className="mt-6 text-center text-[13.5px] text-white/45">Looking for a service status update? See <Link href="/status" className="text-brand hover:underline">System status</Link>.</p>
      </Section>
    </>
  );
}
