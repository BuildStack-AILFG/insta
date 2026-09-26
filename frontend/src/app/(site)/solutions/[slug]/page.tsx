import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { CtaBand, FaqList, FeatureGrid, JsonLd, LinkCard, PageHero, Section } from "@/components/site/blocks";
import { ChatMock } from "@/components/site/visuals";
import { featureBySlug } from "@/lib/site/features";
import { SOLUTIONS, solutionBySlug } from "@/lib/site/solutions";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { pageMetadata } from "@/lib/site/seo";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => SOLUTIONS.map((s) => ({ slug: s.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = solutionBySlug((await params).slug);
  if (!s) return {};
  return pageMetadata({ title: s.metaTitle, description: s.metaDescription, path: `/solutions/${s.slug}`, ogTitle: s.h1, ogKind: "Solutions", keywords: s.keywords });
}

export default async function SolutionPage({ params }: Props) {
  const s = solutionBySlug((await params).slug);
  if (!s) notFound();
  const others = SOLUTIONS.filter((x) => x.slug !== s.slug).slice(0, 3);
  const feats = s.features.map((f) => featureBySlug(f)).filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: s.metaTitle, description: s.metaDescription }} />
      <PageHero
        breadcrumbs={[{ name: "Solutions", path: "/solutions" }, { name: s.navLabel, path: `/solutions/${s.slug}` }]}
        overline={s.navLabel}
        title={s.h1}
        lead={s.lead}
        visual={<div><ChatMock messages={s.chat} /><p className="mt-3 text-center text-[12px] text-white/40">{s.chatCaption}</p></div>}
        actions={<><Link href="/signup" className={M.btnPrimary}>Start free trial <ArrowRight size={16} /></Link><Link href="/contact?topic=demo" className={M.btnOutline}>Book a demo</Link></>}
      />

      <Section overline="The challenge" title={`What makes Instagram hard to keep up with in ${s.navLabel.toLowerCase().split(" &")[0]}`} alt>
        <FeatureGrid items={s.challenges.map((c) => ({ icon: AlertTriangle, title: c.title, body: c.body }))} />
      </Section>

      <Section overline="The playbook" title="How teams solve it with GramForGrow">
        <ol className="grid gap-4 md:grid-cols-2">
          {s.playbook.map((p, i) => {
            const f = featureBySlug(p.feature);
            return (
              <li key={p.title} className={`${M.card} flex gap-4 p-6`}>
                <span className="btn-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="text-[16px] font-semibold text-white">{p.title}</h3>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-white/60">{p.body}</p>
                  {f && <Link href={`/features/${f.slug}`} className="mt-2 inline-flex items-center gap-1 text-[13.5px] font-medium text-brand hover:underline">{f.navLabel} <ArrowRight size={13} /></Link>}
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section overline="Features you'll use" title="Built into every plan" alt>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{feats.map((f) => <LinkCard key={f.slug} href={`/features/${f.slug}`} icon={f.icon} title={f.navLabel} body={f.tagline} />)}</div>
      </Section>

      <Section overline="FAQ" title="Common questions" narrow>
        <FaqList faqs={s.faqs} />
      </Section>

      <Section overline="More solutions" title="Explore other industries" alt>
        <div className="grid gap-4 md:grid-cols-3">{others.map((o) => <LinkCard key={o.slug} href={`/solutions/${o.slug}`} icon={o.icon} title={o.navLabel} body={o.tagline} />)}</div>
      </Section>
      <CtaBand />
    </>
  );
}
