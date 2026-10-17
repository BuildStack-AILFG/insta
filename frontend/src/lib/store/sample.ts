import type { HeroSlide, PublicProduct } from "@/lib/api";
import type { StoreData } from "@/components/store/StoreShell";
import type { TemplateId } from "./templates";

/**
 * Sample products and banners for the template preview, so a store with few (or no) products still shows a finished design.
 * Images are generated SVG art — no external files. Sample ids start with `sample-`; ProductCard turns their links off.
 */
export const isSample = (id: string) => id.startsWith("sample-");

const svg = (w: number, h: number, a: string, b: string, shape: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='${w}' height='${h}' fill='url(#g)'/>${shape}</svg>`,
  )}`;

/** Soft abstract shapes so each sample photo reads as a different "product". */
const shapes: ((w: number, h: number) => string)[] = [
  (w, h) => `<circle cx='${w * 0.5}' cy='${h * 0.55}' r='${w * 0.28}' fill='white' fill-opacity='.18'/><circle cx='${w * 0.5}' cy='${h * 0.55}' r='${w * 0.14}' fill='white' fill-opacity='.22'/>`,
  (w, h) => `<rect x='${w * 0.28}' y='${h * 0.25}' width='${w * 0.44}' height='${h * 0.5}' rx='${w * 0.2}' fill='white' fill-opacity='.2'/>`,
  (w, h) => `<path d='M0 ${h * 0.72} Q ${w * 0.3} ${h * 0.5} ${w * 0.6} ${h * 0.7} T ${w} ${h * 0.6} V ${h} H0 Z' fill='white' fill-opacity='.18'/><circle cx='${w * 0.72}' cy='${h * 0.28}' r='${w * 0.1}' fill='white' fill-opacity='.28'/>`,
  (w, h) => `<polygon points='${w * 0.5},${h * 0.22} ${w * 0.78},${h * 0.7} ${w * 0.22},${h * 0.7}' fill='white' fill-opacity='.2'/>`,
];
const art = (i: number, a: string, b: string, w = 800, h = 1000) => svg(w, h, a, b, shapes[i % shapes.length](w, h));

type Pal = [string, string][];
type SampleSet = { cats: string[]; products: [string, number, number | null][]; hero: [string, string, string][]; pal: Pal };

const SETS: Record<TemplateId, SampleSet> = {
  classic: {
    cats: ["Popular", "New"], pal: [["#d4a0a7", "#7d3a46"], ["#9db4c0", "#40596b"], ["#c9b79c", "#6b5a3e"], ["#a8c3a0", "#44663f"]],
    products: [["Everyday tote", 129900, 159900], ["Classic shirt", 99900, null], ["Canvas sneakers", 149900, null], ["Travel bottle", 59900, 79900], ["Desk planner", 39900, null], ["Scented candle", 49900, null], ["Linen cap", 34900, null], ["Gift box", 89900, null]],
    hero: [["New arrivals", "Fresh in the store", "Shop now"], ["Best sellers", "What everyone is ordering", "Shop best sellers"]],
  },
  boutique: {
    cats: ["Kurtas", "Sarees", "Co-ord sets"], pal: [["#d9b8a4", "#8a5a44"], ["#b7a58f", "#5f4b36"], ["#c9a0a0", "#7a3f4a"], ["#a9b49a", "#56633f"]],
    products: [["Mulmul cotton kurta", 149900, 179900], ["Chanderi silk saree", 389900, null], ["Block-print co-ord set", 219900, null], ["Linen shirt dress", 189900, 229900], ["Embroidered dupatta", 79900, null], ["Ikat straight pants", 119900, null], ["Bandhani kurta set", 259900, null], ["Cotton slip dress", 139900, null]],
    hero: [["The new season edit", "Soft fabrics, easy silhouettes, made in small batches", "Explore the edit"], ["Festive wear", "Handpicked pieces for every celebration", "Shop festive"]],
  },
  jewellery: {
    cats: ["Earrings", "Necklaces", "Bridal"], pal: [["#c9a24b", "#5a4210"], ["#8a7a60", "#2f2619"], ["#b9a68a", "#4d3f2a"], ["#a8896a", "#3b2c1c"]],
    products: [["Kundan jhumkas", 189900, 229900], ["Pearl drop necklace", 349900, null], ["Gold-plated hoops", 99900, null], ["Temple choker", 459900, null], ["Polki studs", 149900, null], ["Layered chain", 129900, 159900], ["Bridal haar set", 899900, null], ["Meenakari bangles", 219900, null]],
    hero: [["Crafted to be kept", "Handmade jewellery for the moments that matter", "Discover the collection"], ["Wedding season", "Statement sets for every ceremony", "Shop bridal"]],
  },
  bakery: {
    cats: ["Cakes", "Cupcakes", "Cookies & brownies"], pal: [["#e0a96d", "#8a4b1f"], ["#d9889a", "#7a2f48"], ["#c79a6b", "#5f3a1c"], ["#e8c37a", "#8f6418"]],
    products: [["Chocolate truffle cake", 79900, null], ["Biscoff cheesecake", 99900, 119900], ["Red velvet cupcakes (6)", 54900, null], ["Fudgy brownie box", 39900, null], ["Lemon drizzle loaf", 44900, null], ["Choco-chip cookies (12)", 34900, null], ["Black forest cake", 74900, null], ["Tea-time hamper", 129900, null]],
    hero: [["Baked fresh, just for you", "Cakes, cookies and celebration bakes made to order", "Order now"], ["Birthday cakes", "Tell us the occasion, we'll bake the rest", "See cakes"]],
  },
  fitness: {
    cats: ["Protein", "Accessories", "Equipment"], pal: [["#2b2d31", "#0b0b0d"], ["#3a3f1a", "#111408"], ["#35353b", "#0e0e10"], ["#444", "#111"]],
    products: [["Whey protein 1kg", 249900, 279900], ["Plant protein 500g", 189900, null], ["Pre-workout 300g", 169900, 199900], ["Shaker bottle 700ml", 39900, null], ["Hex dumbbell pair", 129900, null], ["Resistance band kit", 59900, 79900], ["Creatine monohydrate", 99900, null], ["Gym gloves", 44900, null]],
    hero: [["Fuel your training", "Authentic supplements and gym gear, delivered fast", "Shop now"], ["New drops", "Fresh stock just landed", "Shop new"]],
  },
  beauty: {
    cats: ["Skincare", "Hair care", "Wellness"], pal: [["#cfe0d2", "#6a8f76"], ["#e5d9c8", "#9a8362"], ["#d5e3e8", "#6f93a3"], ["#e8d3d3", "#a37a7a"]],
    products: [["Vitamin C serum", 79900, 99900], ["Hydrating moisturiser", 64900, null], ["Gentle foaming cleanser", 49900, null], ["SPF 50 sunscreen", 59900, null], ["Hair growth oil", 54900, 69900], ["Daily multivitamin", 89900, null], ["Aloe vera gel", 34900, null], ["Night repair cream", 99900, null]],
    hero: [["Simple, honest skincare", "Products that work, with ingredients you can read", "Shop the range"], ["Wellness essentials", "Daily nutrition and self-care", "Shop wellness"]],
  },
};

export function sampleFor(id: TemplateId): { products: PublicProduct[]; hero: HeroSlide[]; covers: Record<string, string> } {
  const set = SETS[id];
  const products: PublicProduct[] = set.products.map(([name, price, compare], i) => {
    const [a, b] = set.pal[i % set.pal.length];
    return {
      id: `sample-${id}-${i}`, name, description: "", category: set.cats[i % set.cats.length], price, price_varies: false, compare_at_price: compare, image_url: art(i, a, b),
      permalink: null, sold_out: false, options: [], variants: [], images: [art(i, a, b), art(i + 1, b, a)],
    };
  });
  const hero: HeroSlide[] = set.hero.map(([title, subtitle, cta_label], i) => ({
    image_url: art(i + 2, set.pal[i][0], set.pal[i][1], 1600, 900), title, subtitle, cta_label, product_id: null,
  }));
  const covers = Object.fromEntries(set.cats.map((c, i) => [c, art(i + 1, set.pal[i % set.pal.length][0], set.pal[i % set.pal.length][1])]));
  return { products, hero, covers };
}

/** Fill a nearly-empty store with sample content (preview only). Real products always come first. */
export function withSamples(data: StoreData, id: TemplateId): { data: StoreData; filled: boolean } {
  const needProducts = data.products.length < 4;
  const needHero = data.store.site.hero.length === 0 && !data.products.some((p) => p.image_url);
  if (!needProducts && !needHero) return { data, filled: false };
  const s = sampleFor(id);
  const products = needProducts ? [...data.products, ...s.products.slice(0, Math.max(0, 8 - data.products.length))] : data.products;
  const ids = products.map((p) => p.id);
  const store = { ...data.store, site: { ...data.store.site, hero: needHero ? s.hero : data.store.site.hero } };
  return {
    filled: true,
    data: {
      ...data, store, products, category_images: { ...s.covers, ...(data.category_images ?? {}) },
      best_sellers: data.best_sellers.length ? data.best_sellers : ids.slice(0, 4), new_arrivals: data.new_arrivals.length ? data.new_arrivals : ids.slice(4, 8),
    },
  };
}
