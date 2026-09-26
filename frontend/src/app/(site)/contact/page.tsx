import { Clock, Mail, MapPin, MessageCircle } from "lucide-react";
import ContactForm from "@/components/site/ContactForm";
import { JsonLd, PageHero, Section } from "@/components/site/blocks";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { SITE, whatsappLink } from "@/lib/site/config";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Contact Us — Sales, Support & Demos",
  description: `Talk to the ${SITE.name} team about pricing, a live demo, support or partnerships. Message us on WhatsApp, email ${SITE.supportEmail} or send the form.`,
  path: "/contact",
  ogTitle: "Let's talk about your Instagram growth",
  ogKind: "Contact",
});

export default function ContactPage() {
  const cards = [
    { icon: MessageCircle, title: "WhatsApp", body: "The fastest way to reach us.", href: whatsappLink("Hi, I'd like to know more about GramForGrow"), label: "Chat with us" },
    { icon: Mail, title: "Email", body: SITE.supportEmail, href: `mailto:${SITE.supportEmail}`, label: "Send an email" },
  ];
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ContactPage", name: `Contact ${SITE.name}`, url: `${SITE.url}/contact` }} />
      <PageHero breadcrumbs={[{ name: "Contact", path: "/contact" }]} overline="Contact" title="Let's talk about your Instagram growth" lead="Questions about pricing, a live walkthrough for your team, help with your account or a partnership idea — we read every message." />
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <ContactForm />
          <aside className="space-y-4">
            {cards.map((c) => (
              <a key={c.title} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={`${M.card} ${M.cardHover} flex gap-4 p-5`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand"><c.icon size={20} /></span>
                <span><span className="block text-[15px] font-semibold text-white">{c.title}</span><span className="block text-[13.5px] text-white/55">{c.body}</span><span className="mt-1 block text-[13px] font-medium text-brand">{c.label} →</span></span>
              </a>
            ))}
            <div className={`${M.card} space-y-3 p-5 text-[13.5px] text-white/60`}>
              <p className="flex gap-3"><Clock size={18} className="mt-0.5 shrink-0 text-brand" /><span><b className="text-white">Response time.</b> We aim to reply within one business day, Monday to Saturday.</span></p>
              <p className="flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-brand" /><span><b className="text-white">{SITE.legalName}</b>{SITE.address ? <><br />{SITE.address}</> : <><br />India</>}{SITE.gstin && <><br />GSTIN: {SITE.gstin}</>}</span></p>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
