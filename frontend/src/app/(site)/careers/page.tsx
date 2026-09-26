import { Code2, Headphones, LineChart, MailPlus, Palette, Rocket, Users } from "lucide-react";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/blocks";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { SITE } from "@/lib/site/config";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: `Careers at ${SITE.name} — Join ${SITE.legalName}`,
  description: `We're a small team building Instagram automation for growing brands and creators. See how we work and the kinds of people we'd like to meet at ${SITE.legalName}.`,
  path: "/careers",
  ogTitle: `Build ${SITE.name} with us`,
  ogKind: "Careers",
});

export default function CareersPage() {
  const mail = `mailto:${SITE.supportEmail}?subject=${encodeURIComponent("Careers at GramForGrow")}`;
  return (
    <>
      <PageHero
        breadcrumbs={[{ name: "Careers", path: "/careers" }]}
        overline="Careers"
        title="Help businesses grow through better conversations"
        lead="We're a small, focused team. If you like building useful software with a lot of ownership, we'd like to hear from you."
        actions={<a href={mail} className={M.btnPrimary}><MailPlus size={16} /> Introduce yourself</a>}
      />
      <Section overline="How we work" title="A team that values craft and clarity" alt>
        <FeatureGrid items={[
          { icon: Rocket, title: "Ownership", body: "Small teams, real responsibility. You'll see your work in customers' hands quickly." },
          { icon: Users, title: "Talk to customers", body: "Everyone hears directly from the people using the product, so we build what matters." },
          { icon: LineChart, title: "Measure what matters", body: "We prefer clear goals and honest numbers over vanity metrics." },
        ]} />
      </Section>
      <Section overline="Where we hire" title="Roles we often need" lead="There are no advertised openings right now, but we're always glad to meet strong people in these areas.">
        <FeatureGrid cols={4} items={[
          { icon: Code2, title: "Engineering", body: "Full-stack (Next.js, Python/FastAPI, Postgres) and integrations with Meta's Instagram API." },
          { icon: Headphones, title: "Customer success", body: "Help brands get their Instagram automations live and get more from them." },
          { icon: LineChart, title: "Sales & partnerships", body: "Work with agencies and brands turning Instagram into a sales channel." },
          { icon: Palette, title: "Design & content", body: "Product design, documentation and educational content." },
        ]} />
      </Section>
      <Section narrow title="How to reach us">
        <div className={`${M.card} p-6 text-[14.5px] leading-relaxed text-white/65`}>
          <p>Send a short note about what you&apos;ve built or done, links to your work and the kind of role you&apos;re looking for to <a className="font-medium text-brand hover:underline" href={mail}>{SITE.supportEmail}</a> with the subject &ldquo;Careers&rdquo;. We read every message and will reply if there&apos;s a match.</p>
        </div>
      </Section>
      <CtaBand title="Not looking for a job?" body="Try GramForGrow free or talk to our team about your use case." />
    </>
  );
}
