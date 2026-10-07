import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CtaBand, FaqList, FeatureGrid, JsonLd, LinkCard, PageHero, Section, Steps } from "@/components/site/blocks";
import Visual from "@/components/site/visuals";
import { FEATURES, featureBySlug } from "@/lib/site/features";
import { SOLUTIONS } from "@/lib/site/solutions";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { pageMetadata } from "@/lib/site/seo";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => FEATURES.map((f) => ({ slug: f.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const f = featureBySlug((await params).slug);
  if (!f) return {};
  return pageMetadata({ title: f.metaTitle, description: f.metaDescription, path: `/features/${f.slug}`, ogTitle: f.h1, ogKind: "Features", keywords: f.keywords });
}

export default async function FeaturePage({ params }: Props) {
  const f = featureBySlug((await params).slug);
  if (!f) notFound();
  const related = f.related.map((s) => featureBySlug(s)).filter((x): x is NonNullable<typeof x> => !!x);
  const solutions = SOLUTIONS.filter((s) => s.features.includes(f.slug)).slice(0, 3);

  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: f.metaTitle, description: f.metaDescription, about: f.navLabel }} />
      <PageHero
        breadcrumbs={[{ name: "Features", path: "/features" }, { name: f.navLabel, path: `/features/${f.slug}` }]}
        overline={f.navLabel}
        title={f.h1}
        lead={f.lead}
        visual={<Visual kind={f.visual} />}
        actions={<><Link href="/signup" className={M.btnPrimary}>Start free trial <ArrowRight size={16} /></Link><Link href="/contact?topic=demo" className={M.btnOutline}>Book a demo</Link></>}
      />

      <Section overline="What you get" title={`Why teams choose ${f.navLabel.toLowerCase()} in DMForGrow`} alt>
        <FeatureGrid items={f.benefits} />
      </Section>

      <Section overline="How it works" title="From setup to results in four steps">
        <Steps steps={f.steps} />
      </Section>

      <Section overline="Use cases" title="Where it makes a difference" alt>
        <div className="grid gap-4 md:grid-cols-3">
          {f.useCases.map((u) => (
            <div key={u.title} className={`${M.card} p-6`}><h3 className="text-[16.5px] font-semibold text-white">{u.title}</h3><p className="mt-2 text-[14.5px] leading-relaxed text-white/60">{u.body}</p></div>
          ))}
        </div>
        {solutions.length > 0 && (
          <p className="mt-6 text-[14px] text-white/55">
            See it in your industry:{" "}
            {solutions.map((s, i) => <span key={s.slug}>{i > 0 && ", "}<Link href={`/solutions/${s.slug}`} className="font-medium text-brand hover:underline">{s.navLabel}</Link></span>)}
          </p>
        )}
      </Section>

      <Section overline="FAQ" title={`Questions about ${f.navLabel.toLowerCase()}`} narrow>
        <FaqList faqs={f.faqs} />
      </Section>

      {related.length > 0 && (
        <Section overline="Keep exploring" title="Works best together" alt>
          <div className="grid gap-4 md:grid-cols-3">{related.map((r) => <LinkCard key={r.slug} href={`/features/${r.slug}`} icon={r.icon} title={r.navLabel} body={r.tagline} />)}</div>
        </Section>
      )}
      <CtaBand />
    </>
  );
}
