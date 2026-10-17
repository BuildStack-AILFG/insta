import Link from "next/link";
import type { PublicProduct } from "@/lib/api";
import { categoriesOf, categoryHref } from "@/lib/store/categories";

/** "Shop by category": a round photo per category (the first product photo in it) that opens that category's page. */
export default function CategoryTiles({ slug, title, products, covers }: { slug: string; title: string; products: PublicProduct[]; covers?: Record<string, string> }) {
  const tiles = categoriesOf(products, covers);
  if (tiles.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 pt-14">
      <h2 className="mb-5 text-[22px] font-bold tracking-tight sm:text-[26px]">{title}</h2>
      <div className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:gap-8">
        {tiles.map((t) => (
          <Link key={t.name} href={categoryHref(slug, t.name)} className="group flex w-24 shrink-0 flex-col items-center gap-2 text-center sm:w-28">
            <span className="ct-img flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[var(--soft)] ring-1 ring-[var(--line)] transition group-hover:ring-2 group-hover:ring-[var(--accent)] sm:h-28 sm:w-28">
              {t.image ? <img src={t.image} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                : <span className="text-[26px] font-bold text-[var(--muted)]">{t.name.slice(0, 1).toUpperCase()}</span>}
            </span>
            <span className="text-[13.5px] font-medium leading-tight">{t.name}</span>
            <span className="-mt-1 text-[11.5px] text-[var(--faint)]">{t.count} item{t.count === 1 ? "" : "s"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
