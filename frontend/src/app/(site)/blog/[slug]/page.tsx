import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock } from "lucide-react";
import { Breadcrumbs, CtaBand, JsonLd, LinkCard, Section } from "@/components/site/blocks";
import NewsletterForm from "@/components/site/NewsletterForm";
import Prose, { tocOf } from "@/components/site/Prose";
import { POSTS, postBySlug } from "@/lib/site/blog";
import { formatDate, SITE } from "@/lib/site/config";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { articleLd, pageMetadata } from "@/lib/site/seo";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => POSTS.map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = postBySlug((await params).slug);
  if (!p) return {};
  return pageMetadata({ title: p.title, description: p.excerpt, path: `/blog/${p.slug}`, ogTitle: p.title, ogKind: p.category, type: "article", publishedTime: p.published, modifiedTime: p.modified ?? p.published, keywords: p.keywords });
}

export default async function PostPage({ params }: Props) {
  const p = postBySlug((await params).slug);
  if (!p) notFound();
  const toc = tocOf(p.body);
  const more = POSTS.filter((x) => x.slug !== p.slug && x.category === p.category).concat(POSTS.filter((x) => x.slug !== p.slug && x.category !== p.category)).slice(0, 3);

  return (
    <>
      <JsonLd data={articleLd({ title: p.title, description: p.excerpt, path: `/blog/${p.slug}`, published: p.published, modified: p.modified, author: `${SITE.name} team`, section: p.category })} />
      <article className="pb-6 pt-32 sm:pt-36">
        <div className={M.containerNarrow}>
          <Breadcrumbs trail={[{ name: "Blog", path: "/blog" }, { name: p.title, path: `/blog/${p.slug}` }]} />
          <p className="text-[12px] font-semibold uppercase tracking-wide text-brand">{p.category}</p>
          <h1 className="mt-3 font-[family-name:var(--font-plus-jakarta)] text-[2rem] font-bold leading-tight tracking-tight text-white sm:text-[2.6rem]">{p.title}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-white/60">{p.excerpt}</p>
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 pb-6 text-[13px] text-white/45">
            <span>By the {SITE.name} team</span><time dateTime={p.published}>{formatDate(p.published)}</time><span className="flex items-center gap-1"><Clock size={13} /> {p.readMinutes} min read</span>
          </p>

          {toc.length > 2 && (
            <nav aria-label="In this article" className="my-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">In this article</p>
              <ul className="space-y-1.5 text-[14px]">{toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className="text-white/65 hover:text-brand">{t.text}</a></li>)}</ul>
            </nav>
          )}

          <div className="mt-6"><Prose blocks={p.body} /></div>

          <aside className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand/30 bg-brand/10 p-6">
            <p className="max-w-md text-[15px] text-white/80">Ready to put this into practice?</p>
            <Link href={p.cta.href} className={M.btnPrimary}>{p.cta.label} <ArrowRight size={16} /></Link>
          </aside>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="mb-3 text-[15px] font-semibold text-white">Enjoyed this? Get one useful email a month.</p>
            <NewsletterForm source={`blog-${p.slug}`} />
          </div>
        </div>
      </article>

      <Section overline="Keep reading" title="More from the blog" alt>
        <div className="grid gap-4 md:grid-cols-3">{more.map((x) => <LinkCard key={x.slug} href={`/blog/${x.slug}`} meta={x.category} title={x.title} body={x.excerpt} />)}</div>
      </Section>
      <CtaBand />
    </>
  );
}
