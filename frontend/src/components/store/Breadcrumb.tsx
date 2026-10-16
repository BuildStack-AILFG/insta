import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** "Home › Category › Product" trail; the last item is the current page and is not a link. */
export default function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 pt-5 text-[13px] text-[var(--muted)]">
      {items.map((it, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight size={13} className="shrink-0 text-[var(--faint)]" />}
          {it.href ? <Link href={it.href} className="hover:text-[var(--fg)]">{it.label}</Link> : <span className="truncate text-[var(--fg)]">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
