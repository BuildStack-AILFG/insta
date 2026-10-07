import { BookOpen, Code2, Rocket, Settings2 } from "lucide-react";
import { LinkCard, PageHero, Section } from "@/components/site/blocks";
import { DOC_GROUPS, DOCS } from "@/lib/site/docs";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Documentation — Guides & REST API Reference",
  description: "Learn how to connect Instagram, set up comment automations, build DM flows, manage your pipeline and payments, and integrate with the DMForGrow REST API and webhooks.",
  path: "/docs",
  ogTitle: "DMForGrow documentation",
  ogKind: "Docs",
  keywords: ["Instagram automation documentation", "Instagram API guide", "DMForGrow API"],
});

const ICON = { "Get started": Rocket, Build: BookOpen, Developers: Code2, Administer: Settings2 } as const;

export default function DocsHome() {
  return (
    <>
      <PageHero breadcrumbs={[{ name: "Documentation", path: "/docs" }]} overline="Documentation" title="Everything you need to automate Instagram with DMForGrow" lead="Step-by-step guides for your team and a complete reference for developers." />
      {DOC_GROUPS.map((g, i) => (
        <Section key={g} title={g} alt={i % 2 === 0}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DOCS.filter((d) => d.group === g).map((d) => <LinkCard key={d.slug} href={`/docs/${d.slug}`} icon={ICON[g]} title={d.title} body={d.description} />)}
          </div>
        </Section>
      ))}
    </>
  );
}
