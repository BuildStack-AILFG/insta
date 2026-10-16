import type { PublicProduct } from "@/lib/api";

export type CategoryInfo = { name: string; count: number; image: string | null };

/** The categories the seller has used, A–Z, each with its item count and the first product photo in it. */
export function categoriesOf(products: PublicProduct[], covers: Record<string, string> = {}): CategoryInfo[] {
  const map = new Map<string, CategoryInfo>();
  for (const p of products) {
    if (!p.category) continue;
    const c = map.get(p.category) ?? { name: p.category, count: 0, image: null };
    c.image ??= p.image_url;
    c.count += 1;
    map.set(p.category, c);
  }
  for (const c of map.values()) c.image = covers[c.name] ?? c.image;
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const categoryHref = (slug: string, name: string) => `/s/${slug}/c/${encodeURIComponent(name)}`;
