import Link from "next/link";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MARKETING as M } from "@/lib/marketing/designTokens";
import { breadcrumbLd, faqLd, type Faq } from "@/lib/site/seo";

export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function Breadcrumbs({ trail }: { trail: { name: string; path: string }[] }) {
  return (
    <>
      <JsonLd data={breadcrumbLd(trail)} />
      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1 text-[13px] text-white/45">
        <Link href="/" className="hover:text-white">Home</Link>
        {trail.map((t, i) => (
          <span key={t.path} className="flex items-center gap-1">
            <ChevronRight size={13} />
            {i === trail.length - 1 ? <span aria-current="page" className="text-white/70">{t.name}</span> : <Link href={t.path} className="hover:text-white">{t.name}</Link>}
          </span>
        ))}
      </nav>
    </>
  );
}

/** Glow behind heroes: the brand colour fading into the page, so it works in both themes. */
const glow = { backgroundImage: "radial-gradient(60% 55% at 50% 0%, color-mix(in srgb, var(--brand) 24%, transparent), transparent 72%)" };

export function PageHero({ overline, title, lead, actions, visual, breadcrumbs, center }: {
  overline?: string; title: string; lead: string; actions?: ReactNode; visual?: ReactNode; breadcrumbs?: { name: string; path: string }[]; center?: boolean;
}) {
  return (
    <section className="relative overflow-hidden pb-14 pt-32 sm:pt-36 lg:pb-20 lg:pt-40">
      <div aria-hidden className="absolute inset-0 -z-10" style={glow} />
      <div className={M.container}>
        {breadcrumbs && <Breadcrumbs trail={breadcrumbs} />}
        <div className={visual ? "grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]" : center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
          <div>
            {overline && <p className={`${M.overline} mb-4`}>{overline}</p>}
            <h1 className={M.h1}>{title}</h1>
            <p className={`${M.bodyLarge} mt-5 max-w-2xl ${center && !visual ? "mx-auto" : ""}`}>{lead}</p>
            {actions && <div className={`mt-8 flex flex-wrap gap-3 ${center && !visual ? "justify-center" : ""}`}>{actions}</div>}
          </div>
          {visual && <div className="relative">{visual}</div>}
        </div>
      </div>
    </section>
  );
}

export function Section({ id, overline, title, lead, children, alt, narrow }: { id?: string; overline?: string; title?: string; lead?: string; children: ReactNode; alt?: boolean; narrow?: boolean }) {
  return (
    <section id={id} className={`${M.section} ${alt ? "bg-alt" : ""}`}>
      <div className={narrow ? M.containerNarrow : M.container}>
        {(title || overline) && (
          <div className="mb-10 max-w-2xl">
            {overline && <p className={`${M.overline} mb-3`}>{overline}</p>}
            {title && <h2 className={M.h2}>{title}</h2>}
            {lead && <p className={`${M.body} mt-3`}>{lead}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand"><Icon size={20} strokeWidth={1.8} /></span>;
}

export function FeatureGrid({ items, cols = 3 }: { items: { icon: LucideIcon; title: string; body: string; href?: string }[]; cols?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <ul className={`grid gap-4 ${grid}`}>
      {items.map((it) => {
        const inner = (
          <>
            <IconTile icon={it.icon} />
            <h3 className="mt-4 text-[16.5px] font-semibold text-white">{it.title}</h3>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-white/60">{it.body}</p>
            {it.href && <span className="mt-3 inline-flex items-center gap-1 text-[13.5px] font-medium text-brand">Learn more <ArrowRight size={14} /></span>}
          </>
        );
        return (
          <li key={it.title}>
            {it.href ? <Link href={it.href} className={`${M.card} ${M.cardHover} block h-full p-6`}>{inner}</Link> : <div className={`${M.card} h-full p-6`}>{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.title} className={`${M.card} relative p-6`}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white btn-accent">{i + 1}</span>
          <h3 className="mt-4 text-[16px] font-semibold text-white">{s.title}</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-white/60">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function FaqList({ faqs, withSchema = true }: { faqs: Faq[]; withSchema?: boolean }) {
  return (
    <>
      {withSchema && <JsonLd data={faqLd(faqs)} />}
      <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        {faqs.map((f) => (
          <details key={f.q} className="group px-5 py-4 open:bg-white/[0.03]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15.5px] font-semibold text-white [&::-webkit-details-marker]:hidden">
              {f.q}
              <Plus size={18} className="shrink-0 text-white/40 transition-transform group-open:rotate-45" />
            </summary>
            <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-white/60">{f.a}</p>
          </details>
        ))}
      </div>
    </>
  );
}

export function CtaBand({ title = "Start turning comments into customers", body = "Free trial. No credit card. Connect Instagram and go live in minutes.", primary = { label: "Start free trial", href: "/signup" }, secondary = { label: "Talk to sales", href: "/contact?topic=sales" } }: {
  title?: string; body?: string; primary?: { label: string; href: string }; secondary?: { label: string; href: string };
}) {
  return (
    <section className="py-12 md:py-16">
      <div className={M.container}>
        <div className="relative overflow-hidden rounded-3xl border border-brand/30 px-6 py-12 text-center sm:px-12" style={{ backgroundImage: "linear-gradient(135deg, color-mix(in srgb, var(--brand) 30%, var(--background)), var(--background))" }}>
          <h2 className={`${M.h2} mx-auto max-w-2xl`}>{title}</h2>
          <p className={`${M.body} mx-auto mt-3 max-w-xl`}>{body}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href={primary.href} className={M.btnPrimary}>{primary.label} <ArrowRight size={16} /></Link>
            <Link href={secondary.href} className={M.btnOutline}>{secondary.label}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Small "card with a link" used for related content lists. */
export function LinkCard({ href, title, body, icon: Icon, meta }: { href: string; title: string; body?: string; icon?: LucideIcon; meta?: string }) {
  return (
    <Link href={href} className={`${M.card} ${M.cardHover} flex h-full flex-col p-5`}>
      {Icon && <IconTile icon={Icon} />}
      {meta && <p className="text-[11.5px] font-semibold uppercase tracking-wide text-brand">{meta}</p>}
      <h3 className={`text-[16px] font-semibold text-white ${Icon ? "mt-3" : "mt-1"}`}>{title}</h3>
      {body && <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-white/60">{body}</p>}
      <span className="mt-3 inline-flex items-center gap-1 text-[13.5px] font-medium text-brand">Read more <ArrowRight size={14} /></span>
    </Link>
  );
}
