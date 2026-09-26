import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Breadcrumbs, JsonLd } from "@/components/site/blocks";
import Prose, { tocOf } from "@/components/site/Prose";
import { DOC_GROUPS, DOCS, docBySlug } from "@/lib/site/docs";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { absoluteUrl } from "@/lib/site/config";
import { pageMetadata } from "@/lib/site/seo";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => DOCS.map((d) => ({ slug: d.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = docBySlug((await params).slug);
  if (!d) return {};
  return pageMetadata({ title: `${d.title} — Docs`, description: d.description, path: `/docs/${d.slug}`, ogTitle: d.title, ogKind: "Docs" });
}

export default async function DocPage({ params }: Props) {
  const d = docBySlug((await params).slug);
  if (!d) notFound();
  const toc = tocOf(d.body);
  const i = DOCS.findIndex((x) => x.slug === d.slug);
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];

  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "TechArticle", headline: d.title, description: d.description, url: absoluteUrl(`/docs/${d.slug}`), inLanguage: "en-IN", publisher: { "@id": absoluteUrl("/#organization") } }} />
      <div className={`${M.container} pb-16 pt-32 sm:pt-36`}>
        <Breadcrumbs trail={[{ name: "Documentation", path: "/docs" }, { name: d.title, path: `/docs/${d.slug}` }]} />
        <div className="grid gap-10 lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_200px]">
          <nav aria-label="Documentation" className="hidden lg:block">
            <div className="sticky top-28 space-y-5 text-[14px]">
              {DOC_GROUPS.map((g) => (
                <div key={g}>
                  <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-white/40">{g}</p>
                  <ul className="space-y-0.5">{DOCS.filter((x) => x.group === g).map((x) => <li key={x.slug}><Link href={`/docs/${x.slug}`} aria-current={x.slug === d.slug ? "page" : undefined} className={`block rounded-md px-2.5 py-1.5 ${x.slug === d.slug ? "bg-brand/15 font-medium text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white"}`}>{x.title}</Link></li>)}</ul>
                </div>
              ))}
            </div>
          </nav>

          <article className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand">{d.group}</p>
            <h1 className="mt-2 font-[family-name:var(--font-plus-jakarta)] text-[2rem] font-bold tracking-tight text-white sm:text-[2.4rem]">{d.title}</h1>
            <p className="mt-3 mb-6 text-[16.5px] leading-relaxed text-white/60">{d.description}</p>
            <Prose blocks={d.body} />
            <div className="mt-12 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-2">
              {prev ? <Link href={`/docs/${prev.slug}`} className="rounded-xl border border-white/10 p-4 hover:border-brand/40"><span className="flex items-center gap-1 text-[12px] text-white/40"><ArrowLeft size={12} /> Previous</span><span className="mt-0.5 block font-medium text-white">{prev.title}</span></Link> : <span />}
              {next && <Link href={`/docs/${next.slug}`} className="rounded-xl border border-white/10 p-4 text-right hover:border-brand/40"><span className="flex items-center justify-end gap-1 text-[12px] text-white/40">Next <ArrowRight size={12} /></span><span className="mt-0.5 block font-medium text-white">{next.title}</span></Link>}
            </div>
            <p className="mt-8 text-[13.5px] text-white/45">Something missing or unclear? <Link href="/contact?topic=support" className="text-brand hover:underline">Tell us</Link> and we&apos;ll improve this page.</p>
          </article>

          <aside className="hidden xl:block">
            {toc.length > 1 && (
              <div className="sticky top-28 text-[13px]">
                <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-white/40">On this page</p>
                <ul className="space-y-1.5 border-l border-white/10 pl-3">{toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className="text-white/55 hover:text-brand">{t.text}</a></li>)}</ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
