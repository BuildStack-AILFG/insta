import Link from "next/link";
import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import type { ReactNode } from "react";
import type { Block } from "@/lib/site/seo";

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*)/g;

/** Inline text: **bold**, *italic*, `code` and [links](/path). Internal links use next/link. */
export function inline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.86em] text-white">{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      const cls = "font-medium text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand";
      return href.startsWith("/") ? <Link key={i} href={href} className={cls}>{label}</Link> : <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={cls}>{label}</a>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const tocOf = (blocks: Block[]) => blocks.filter((b): b is Extract<Block, { type: "h2" }> => b.type === "h2").map((b) => ({ id: slugify(b.text), text: b.text }));

const CALLOUT = {
  info: { icon: Info, cls: "border-sky-500/30 bg-sky-500/10", ink: "text-sky-300" },
  warn: { icon: AlertTriangle, cls: "border-amber-500/30 bg-amber-500/10", ink: "text-amber-300" },
  tip: { icon: Lightbulb, cls: "border-brand/40 bg-brand/10", ink: "text-brand" },
} as const;

/** Long-form content renderer shared by the blog, docs and legal pages. */
export default function Prose({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4 text-[15.5px] leading-[1.75] text-white/70">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h2":
            return <h2 key={i} id={slugify(b.text)} className="scroll-mt-28 pt-6 font-[family-name:var(--font-plus-jakarta)] text-[1.5rem] font-bold tracking-tight text-white">{b.text}</h2>;
          case "h3":
            return <h3 key={i} className="pt-2 text-[1.1rem] font-semibold text-white">{b.text}</h3>;
          case "p":
            return <p key={i}>{inline(b.text)}</p>;
          case "ul":
            return <ul key={i} className="list-disc space-y-2 pl-6 marker:text-brand">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>;
          case "ol":
            return <ol key={i} className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-brand">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>;
          case "callout": {
            const c = CALLOUT[b.tone ?? "info"];
            const Icon = c.icon;
            return (
              <div key={i} className={`flex gap-3 rounded-xl border p-4 ${c.cls}`}>
                <Icon size={18} className={`mt-0.5 shrink-0 ${c.ink}`} />
                <div className="text-[14.5px] leading-relaxed text-white/80">{b.title && <p className="mb-0.5 font-semibold text-white">{b.title}</p>}{inline(b.text)}</div>
              </div>
            );
          }
          case "code":
            return <pre key={i} className="theme-fixed overflow-x-auto rounded-xl border border-white/10 bg-[#0b0f0d] p-4 text-[12.5px] leading-relaxed text-emerald-100"><code>{b.text}</code></pre>;
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[520px] text-left text-[14px]">
                  <thead className="bg-white/[0.05] text-[12px] uppercase tracking-wide text-white/50"><tr>{b.head.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, j) => <tr key={j} className="border-t border-white/10 align-top">{r.map((c, k) => <td key={k} className={`px-4 py-3 ${k === 0 ? "font-medium text-white" : ""}`}>{inline(c)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          case "quote":
            return <blockquote key={i} className="border-l-2 border-brand pl-4 text-white/80">{b.text}{b.by && <footer className="mt-1 text-[13px] text-white/45">— {b.by}</footer>}</blockquote>;
        }
      })}
    </div>
  );
}
