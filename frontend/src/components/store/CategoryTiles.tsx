import Link from "next/link";
import type { PublicProduct } from "@/lib/api";

/** "Shop by category": a round photo per category (the first product photo in it) that opens the Shop all grid filtered to it. */
export default function CategoryTiles({ slug, title, products }: { slug: string; title: string; products: PublicProduct[] }) {
  const tiles = new Map<string, { image: string | null; count: number }>();
  for (const p of products) {
    if (!p.category) continue;
    const t = tiles.get(p.category) ?? { image: null, count: 0 };
    t.image ??= p.image_url;
    t.count += 1;
    tiles.set(p.category, t);
  }
  if (tiles.size === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 pt-14">
      <h2 className="mb-5 text-[22px] font-bold tracking-tight sm:text-[26px]">{title}</h2>
      <div className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:gap-8">
        {[...tiles].sort(([a], [b]) => a.localeCompare(b)).map(([name, t]) => (
          <Link key={name} href={`/s/${slug}?category=${encodeURIComponent(name)}#products`} className="group flex w-24 shrink-0 flex-col items-center gap-2 text-center sm:w-28">
            <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[var(--soft)] ring-1 ring-[var(--line)] transition group-hover:ring-2 group-hover:ring-[var(--accent)] sm:h-28 sm:w-28">
              {t.image ? <img src={t.image} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                : <span className="text-[26px] font-bold text-[var(--muted)]">{name.slice(0, 1).toUpperCase()}</span>}
            </span>
            <span className="text-[13.5px] font-medium leading-tight">{name}</span>
            <span className="-mt-1 text-[11.5px] text-[var(--faint)]">{t.count} item{t.count === 1 ? "" : "s"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
