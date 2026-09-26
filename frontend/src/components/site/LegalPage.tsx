import Link from "next/link";
import { Breadcrumbs } from "@/components/site/blocks";
import Prose, { tocOf } from "@/components/site/Prose";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { formatDate, SITE } from "@/lib/site/config";
import { LEGAL, legalBySlug } from "@/lib/site/legal";
import { pageMetadata } from "@/lib/site/seo";

export function legalMetadata(slug: string) {
  const d = legalBySlug(slug)!;
  return pageMetadata({ title: `${d.title} — ${SITE.name}`, description: d.metaDescription, path: `/${slug}`, ogTitle: d.title, ogKind: "Legal" });
}

/** Shared layout for policy pages: readable column, table of contents, last-updated date and links to the sibling policies. */
export default function LegalPage({ slug }: { slug: string }) {
  const d = legalBySlug(slug)!;
  const toc = tocOf(d.body);
  return (
    <div className={`${M.container} pb-16 pt-32 sm:pt-36`}>
      <Breadcrumbs trail={[{ name: d.title, path: `/${slug}` }]} />
      <div className="grid gap-10 lg:grid-cols-[1fr_260px]">
        <article className="max-w-3xl">
          <h1 className="font-[family-name:var(--font-plus-jakarta)] text-[2.1rem] font-bold tracking-tight text-white sm:text-[2.6rem]">{d.title}</h1>
          <p className="mt-3 text-[16px] text-white/60">{d.summary}</p>
          <p className="mt-2 text-[13px] text-white/40">Last updated <time dateTime={SITE.legalUpdated}>{formatDate(SITE.legalUpdated)}</time> · {SITE.legalName}</p>
          <div className="mt-8"><Prose blocks={d.body} /></div>
        </article>
        <aside className="lg:sticky lg:top-28 lg:self-start">
          {toc.length > 2 && (
            <nav aria-label="On this page" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-[13.5px]">
              <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-white/40">On this page</p>
              <ul className="space-y-1.5">{toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className="text-white/60 hover:text-brand">{t.text}</a></li>)}</ul>
            </nav>
          )}
          <nav aria-label="Legal and trust" className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-[13.5px]">
            <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-white/40">Legal &amp; trust</p>
            <ul className="space-y-1.5">{LEGAL.map((l) => <li key={l.slug}><Link href={`/${l.slug}`} aria-current={l.slug === slug ? "page" : undefined} className={l.slug === slug ? "font-medium text-white" : "text-white/60 hover:text-brand"}>{l.title}</Link></li>)}</ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}
