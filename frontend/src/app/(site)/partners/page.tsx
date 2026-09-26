import { Handshake, LayoutGrid, Plug, Share2 } from "lucide-react";
import ContactForm from "@/components/site/ContactForm";
import { FaqList, FeatureGrid, PageHero, Section } from "@/components/site/blocks";
import { SITE } from "@/lib/site/config";
import { pageMetadata, type Faq } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Partner Programme — Agencies, Referrers & Technology Partners",
  description: `Grow with ${SITE.name}: offer Instagram automation to your clients, refer businesses or integrate your product. Apply to the ${SITE.legalName} partner programme.`,
  path: "/partners",
  ogTitle: `Partner with ${SITE.name}`,
  ogKind: "Partners",
  keywords: ["Instagram automation reseller", "Instagram agency partner", "Instagram automation partner India"],
});

const FAQS: Faq[] = [
  { q: "What do partners get?", a: "Guidance on setting up client workspaces, access to our team for onboarding questions and partner terms shared once you apply. Specific commercial terms depend on the type of partnership." },
  { q: "Do I need to be a large agency?", a: "No. Freelancers, consultants and small agencies are welcome if you help brands grow and sell on Instagram." },
  { q: "Can I white-label GramForGrow?", a: "White-labelling is only available under a written partner agreement. Tell us what you have in mind in the form below." },
  { q: "How do I apply?", a: "Send the form on this page with a few lines about your business and the clients you work with. We'll reply within a few business days." },
];

export default function PartnersPage() {
  return (
    <>
      <PageHero breadcrumbs={[{ name: "Partners", path: "/partners" }]} overline="Partner programme" title="Grow your business by helping others grow on Instagram" lead="Agencies, consultants and software companies partner with us to bring Instagram automation to their clients and customers." />
      <Section overline="Ways to partner" title="Choose the model that fits" alt>
        <FeatureGrid cols={3} items={[
          { icon: Handshake, title: "Agency & implementation partners", body: "Set up and run Instagram automation for your clients — comment automations, flows and reporting — on separate client workspaces." },
          { icon: Share2, title: "Referral partners", body: "Introduce brands that need Instagram automation and we take it from there." },
          { icon: Plug, title: "Technology partners", body: "Build an integration between your product and GramForGrow using our REST API and webhooks." },
        ]} />
      </Section>
      <Section overline="Why GramForGrow" title="What makes it easy to work with">
        <FeatureGrid cols={2} items={[
          { icon: LayoutGrid, title: "Separate workspaces per client", body: "Every client's contacts, automations and team are isolated, with their own plan and invoices." },
          { icon: Plug, title: "Open API and webhooks", body: "Connect the systems your clients already use — stores, payments, CRMs — without waiting on us." },
        ]} />
      </Section>
      <Section overline="Apply" title="Tell us about your business" lead="A few lines are enough. We'll get back to you with next steps and partner terms." narrow>
        <ContactForm defaultTopic="partnership" />
      </Section>
      <Section overline="FAQ" title="Partner questions" alt narrow><FaqList faqs={FAQS} /></Section>
    </>
  );
}
