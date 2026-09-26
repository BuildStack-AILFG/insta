import Link from "next/link";
import { ArrowRight, Compass, Eye, HeartHandshake, IndianRupee, ShieldCheck, Sparkles, Target } from "lucide-react";
import { CtaBand, FeatureGrid, JsonLd, PageHero, Section } from "@/components/site/blocks";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { SITE } from "@/lib/site/config";
import { organizationLd, pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: `About ${SITE.name} — Built by ${SITE.legalName}`,
  description: `${SITE.name} is an Instagram automation platform built by ${SITE.legalName} to help brands and creators turn comments and DMs into customers.`,
  path: "/about",
  ogTitle: `About ${SITE.name}`,
  ogKind: "Company",
  keywords: ["ScaleDesk Technology", "GramForGrow company", "Instagram automation company India"],
});

export default function AboutPage() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <PageHero
        breadcrumbs={[{ name: "About", path: "/about" }]}
        overline="About us"
        title="We build software that helps businesses talk to customers where they already are"
        lead={`${SITE.name} is a product of ${SITE.legalName}. We make Instagram — where your customers discover you — a place where every comment and DM gets answered and turns into a sale.`}
        actions={<><Link href="/contact" className={M.btnPrimary}>Talk to us <ArrowRight size={16} /></Link><Link href="/careers" className={M.btnOutline}>Work with us</Link></>}
      />

      <Section overline="Our mission" title="Make every customer conversation a chance to grow the business" alt>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className={`${M.body} space-y-4`}>
            <p>Most brands grow on Instagram now: a reel goes viral and hundreds of people comment “price?” and “link?”. Answering them by hand is impossible, and every unanswered comment is a lost customer.</p>
            <p>We built GramForGrow to fix that. Comment-to-DM automation that replies in a second, a shared DM inbox for the team, flows and an AI agent for the repetitive questions, and a pipeline and payment links beside the chat.</p>
            <p>We use Meta&apos;s official Instagram API — no password sharing, no risky bots — we price in rupees with GST invoices, and we try to be plain about how things work, including their limits.</p>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            {[["Built for", "Brands, creators and agencies growing on Instagram"], ["Platform", "Meta's official Instagram API"], ["Pricing", "Transparent, in ₹, with GST invoices"], ["Payments", "Razorpay — UPI, cards, netbanking"]].map(([k, v]) => (
              <div key={k} className={`${M.card} p-5`}><dt className="text-[12px] font-semibold uppercase tracking-wide text-brand">{k}</dt><dd className="mt-1.5 text-[14.5px] text-white/80">{v}</dd></div>
            ))}
          </dl>
        </div>
      </Section>

      <Section overline="What we believe" title="Principles we build by">
        <FeatureGrid items={[
          { icon: ShieldCheck, title: "Stay inside the rules", body: "We build on the official API and follow Instagram's messaging rules, so your account stays safe." },
          { icon: Eye, title: "Be honest about limits", body: "AI can be wrong, Instagram limits when you can reply and messages can fail. We show you why, instead of hiding it." },
          { icon: IndianRupee, title: "Fair, simple pricing", body: "Prepaid plans, no surprise auto-renewals, and credit for unused time when you upgrade." },
          { icon: HeartHandshake, title: "People stay in charge", body: "Automation handles the routine. A human is always one click away — for you and for your customers." },
          { icon: Target, title: "Ship what teams use", body: "We start from real workflows — lead qualification, order updates, collections — and keep the product focused." },
          { icon: Sparkles, title: "Respect data", body: "Your customers' conversations are yours. We encrypt credentials and limit who can see what." },
        ]} />
      </Section>

      <Section overline="Company" title="Who's behind GramForGrow" alt narrow>
        <div className={`${M.card} space-y-3 p-6 text-[14.5px] text-white/70`}>
          <p className="flex items-start gap-3"><Compass size={18} className="mt-0.5 shrink-0 text-brand" /><span><b className="text-white">{SITE.legalName}</b> is the company that builds and operates {SITE.name}. It is the contracting party on your invoices, our Terms of Service and our Privacy Policy.</span></p>
          {SITE.address && <p><b className="text-white">Registered office:</b> {SITE.address}</p>}
          {SITE.gstin && <p><b className="text-white">GSTIN:</b> {SITE.gstin}</p>}
          {SITE.cin && <p><b className="text-white">CIN:</b> {SITE.cin}</p>}
          <p><b className="text-white">Contact:</b> <a href={`mailto:${SITE.supportEmail}`} className="text-brand hover:underline">{SITE.supportEmail}</a> · <Link href="/contact" className="text-brand hover:underline">contact form</Link></p>
        </div>
      </Section>
      <CtaBand title="See it working for your business" body="Start a free trial or book a walkthrough with our team." secondary={{ label: "Book a demo", href: "/contact?topic=demo" }} />
    </>
  );
}
