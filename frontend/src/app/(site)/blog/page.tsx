import BlogIndex from "@/components/site/BlogIndex";
import { JsonLd, PageHero, Section } from "@/components/site/blocks";
import NewsletterForm from "@/components/site/NewsletterForm";
import { CATEGORIES, POSTS } from "@/lib/site/blog";
import { absoluteUrl, SITE } from "@/lib/site/config";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = {
  ...pageMetadata({
    title: "Blog — Instagram Automation Playbooks, Guides & How-tos",
    description: "Practical guides for growing on Instagram: comment-to-DM, the 24-hour messaging window, DM flows, lead capture, story replies, payments and AI.",
    path: "/blog",
    ogTitle: "Instagram automation playbooks and guides",
    ogKind: "Blog",
    keywords: ["Instagram automation blog", "Instagram DM marketing guides", "comment to DM tips"],
  }),
  alternates: { canonical: absoluteUrl("/blog"), types: { "application/rss+xml": absoluteUrl("/blog/rss.xml") } },
};

export default function BlogPage() {
  const posts = [...POSTS].sort((a, b) => b.published.localeCompare(a.published));
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Blog", name: `${SITE.name} Blog`, url: absoluteUrl("/blog"), publisher: { "@id": absoluteUrl("/#organization") }, blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: absoluteUrl(`/blog/${p.slug}`), datePublished: p.published })) }} />
      <PageHero breadcrumbs={[{ name: "Blog", path: "/blog" }]} overline="The DMForGrow blog" title="Playbooks for brands that sell from their Instagram" lead="Practical, no-fluff guides on comment-to-DM, DM flows, lead capture, story replies and the rules Instagram sets for businesses." />
      <Section><BlogIndex posts={posts} categories={CATEGORIES} /></Section>
      <Section alt narrow>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h2 className="text-[1.4rem] font-bold text-white">Get new guides in your inbox</h2>
          <p className="mx-auto mt-2 max-w-md text-[14.5px] text-white/55">One useful email a month. No spam, unsubscribe any time.</p>
          <div className="mx-auto mt-5 flex max-w-md justify-center"><NewsletterForm source="blog" /></div>
        </div>
      </Section>
    </>
  );
}
