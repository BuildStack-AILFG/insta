import { Check } from "lucide-react";
import { PageHero, Section } from "@/components/site/blocks";
import { CHANGELOG } from "@/lib/site/changelog";
import { formatDate } from "@/lib/site/config";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Product Updates — What's New in DMForGrow",
  description: "A running log of what we've shipped in DMForGrow: new features, improvements and platform updates for teams growing on Instagram.",
  path: "/changelog",
  ogTitle: "What's new in DMForGrow",
  ogKind: "Updates",
});

const TAG = { New: "bg-emerald-500/15 text-pink-300", Improved: "bg-sky-500/15 text-sky-300", Platform: "bg-violet-500/15 text-violet-300" } as const;

export default function ChangelogPage() {
  return (
    <>
      <PageHero breadcrumbs={[{ name: "Product updates", path: "/changelog" }]} overline="Changelog" title="What's new in DMForGrow" lead="We ship in small steps and write down what changed. The newest updates are at the top." />
      <Section narrow>
        <ol className="relative space-y-10 border-l border-white/10 pl-8">
          {CHANGELOG.map((c) => (
            <li key={c.date + c.title} className="relative">
              <span aria-hidden className="absolute -left-[38px] top-1.5 h-3 w-3 rounded-full border-2 border-brand bg-black" />
              <div className="flex flex-wrap items-center gap-3 text-[13px] text-white/45"><time dateTime={c.date}>{formatDate(c.date)}</time><span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${TAG[c.tag]}`}>{c.tag}</span></div>
              <h2 className="mt-2 text-[1.35rem] font-bold text-white">{c.title}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-white/60">{c.summary}</p>
              <ul className="mt-4 space-y-2">{c.items.map((it) => <li key={it} className="flex gap-2.5 text-[14.5px] text-white/70"><Check size={16} className="mt-1 shrink-0 text-brand" />{it}</li>)}</ul>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
