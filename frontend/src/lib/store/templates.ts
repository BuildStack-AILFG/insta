import type { PublicStore, ShopSite, SiteColors, SiteTextKey } from "@/lib/api";

/**
 * Ready-made storefront templates. A template is a *look* (colours, accent, shapes, fonts and the header / banner layout, all driven by
 * `data-template` in app/s/store-templates.css and StoreShell / HeroCarousel) plus optional *starter content* for its niche.
 * `classic` is the original white storefront and renders exactly as before. Keep ids in step with backend services/shop.py TEMPLATES.
 */
export type TemplateId = "classic" | "boutique" | "jewellery" | "bakery" | "beauty" | "fitness";
export type HeaderLayout = "left" | "center";
export type HeroLayout = "overlay" | "center" | "split" | "inset" | "panel";

export type TemplateStarter = {
  texts: Partial<Record<SiteTextKey, string>>;
  announcement: string;
  about: { title: string; text: string };
  faq: { q: string; a: string }[];
};

export type StoreTemplate = {
  id: TemplateId;
  name: string;
  niche: string;
  blurb: string;
  header: HeaderLayout;
  hero: HeroLayout;
  colors: SiteColors;
  accent: string;
  starter: TemplateStarter;
};

export const TEMPLATES: StoreTemplate[] = [
  {
    id: "classic", name: "Classic", niche: "Everything", blurb: "The clean white store every shop starts with.", header: "left", hero: "overlay",
    colors: { background: "#ffffff", text: "#171717", surface: "#f6f6f4", button_text: "#ffffff" }, accent: "#e11d48",
    starter: { texts: {}, announcement: "", about: { title: "", text: "" }, faq: [] },
  },
  {
    id: "boutique", name: "Fashion", niche: "Boutique, sarees & clothing", blurb: "Editorial serif type, a split banner and tall, quiet product photos.", header: "center", hero: "split",
    colors: { background: "#fbf7f0", text: "#2b2118", surface: "#f1e8da", button_text: "#ffffff" }, accent: "#7c2d12",
    starter: {
      texts: { hero_button: "Explore the edit", categories_title: "Shop by style", best_sellers_title: "Most loved", best_sellers_subtitle: "The pieces our customers keep coming back for",
        new_arrivals_title: "Just in", new_arrivals_subtitle: "Fresh from the studio", all_products_title: "The full collection", instagram_title: "As seen on Instagram", related_title: "Complete the look" },
      announcement: "New arrivals every week · Free shipping on prepaid orders",
      about: { title: "Our story", text: "We started this label because we couldn't find clothes that felt like us. Every piece is chosen or made in small batches, with fabric and fit we'd wear ourselves. Thank you for supporting a small brand." },
      faq: [
        { q: "How do I find my size?", a: "Each product page lists the sizes available. If you're unsure, DM us your measurements on Instagram and we'll help you pick." },
        { q: "Can I exchange an item?", a: "Yes. Message us within 3 days of delivery and we'll arrange an exchange for unworn items with tags." },
        { q: "How long does delivery take?", a: "Most orders ship within 2 days and arrive in 3–7 working days." },
      ],
    },
  },
  {
    id: "jewellery", name: "Jewellery", niche: "Jewellery & accessories", blurb: "Dark and gold, a centred banner and hairline-framed products.", header: "center", hero: "center",
    colors: { background: "#0c0a09", text: "#f5efe6", surface: "#17130f", button_text: "#0c0a09" }, accent: "#c9a24b",
    starter: {
      texts: { hero_button: "Discover the collection", categories_title: "Collections", best_sellers_title: "Signature pieces", best_sellers_subtitle: "Our most coveted designs",
        new_arrivals_title: "New in", new_arrivals_subtitle: "The latest additions", all_products_title: "All jewellery", instagram_title: "On our Instagram", related_title: "You may also love" },
      announcement: "Handcrafted jewellery · Insured delivery across India",
      about: { title: "Crafted with care", text: "Every piece is designed in our studio and finished by hand. We use quality materials and check each item before it leaves us, so it reaches you ready to gift or to keep." },
      faq: [
        { q: "Is the jewellery skin-safe?", a: "Yes. We use skin-friendly, nickel-free materials. Keep pieces dry and store them in the pouch provided to keep the shine." },
        { q: "Do you offer gift wrapping?", a: "Every order comes in a gift-ready box. Tell us on Instagram if you'd like a note added." },
        { q: "What if my order arrives damaged?", a: "Send us a photo within 48 hours of delivery and we'll replace it." },
      ],
    },
  },
  {
    id: "bakery", name: "Bakery & Food", niche: "Cakes, snacks & home food", blurb: "Warm, rounded and friendly, with a framed banner and cosy product cards.", header: "left", hero: "inset",
    colors: { background: "#fff8f0", text: "#3b2417", surface: "#ffeedd", button_text: "#ffffff" }, accent: "#e2622d",
    starter: {
      texts: { hero_button: "Order now", categories_title: "What are you craving?", best_sellers_title: "Customer favourites", best_sellers_subtitle: "Baked fresh, loved by everyone",
        new_arrivals_title: "Fresh out of the oven", new_arrivals_subtitle: "New on the menu", all_products_title: "Our full menu", instagram_title: "Fresh from our Instagram", related_title: "Goes well with", add_to_cart: "Add to basket" },
      announcement: "Baked to order · Order a day in advance for cakes",
      about: { title: "Baked with love", text: "Everything here is made in our home kitchen, in small batches, using real butter and fresh ingredients. Tell us about your celebration and we'll bake something special." },
      faq: [
        { q: "How early should I order?", a: "Cakes need at least 24 hours' notice; custom designs, 2–3 days. Cookies and brownies can usually ship the next day." },
        { q: "Do you deliver across the city?", a: "Yes. Delivery charges depend on distance and are shown at checkout." },
        { q: "How should I store my order?", a: "Keep cakes refrigerated and bring them to room temperature 30 minutes before serving. Eat within 2 days for the best taste." },
      ],
    },
  },
  {
    id: "beauty", name: "Beauty & Wellness", niche: "Skincare, cosmetics & supplements", blurb: "Calm sage tones, a soft banner panel and clean, bordered product cards.", header: "left", hero: "panel",
    colors: { background: "#fbfcfa", text: "#1d2a24", surface: "#eef3ee", button_text: "#ffffff" }, accent: "#3f7a5a",
    starter: {
      texts: { hero_button: "Shop the range", categories_title: "Shop by need", best_sellers_title: "Bestsellers", best_sellers_subtitle: "Trusted by thousands of customers",
        new_arrivals_title: "New arrivals", new_arrivals_subtitle: "Just launched", all_products_title: "All products", instagram_title: "Real results on Instagram", related_title: "Pairs well with" },
      announcement: "100% authentic products · Free delivery on prepaid orders",
      about: { title: "Honest, effective care", text: "We believe good products should be simple and genuine. Everything we sell is sourced from trusted makers, with clear ingredients and honest claims, so you know exactly what you're getting." },
      faq: [
        { q: "Are your products authentic?", a: "Yes. We source directly from brands and manufacturers, and every batch is checked before dispatch." },
        { q: "How do I know what suits me?", a: "DM us on Instagram with your skin type or goal and we'll recommend the right product." },
        { q: "What is your return policy?", a: "Unopened items can be returned within 7 days of delivery. For safety, opened products can't be returned." },
      ],
    },
  },
  {
    id: "fitness", name: "Fitness & Supplements", niche: "Protein, gym gear & wellness", blurb: "Bold dark look with a big banner, goal-based tiles and benefit highlights.", header: "left", hero: "overlay",
    colors: { background: "#0a0a0b", text: "#f4f4f5", surface: "#151518", button_text: "#0a0a0b" }, accent: "#c6f432",
    starter: {
      texts: { hero_button: "Shop now", categories_title: "Shop by goal", best_sellers_title: "Top sellers", best_sellers_subtitle: "What our athletes are buying",
        new_arrivals_title: "New drops", new_arrivals_subtitle: "Fresh stock, just landed", all_products_title: "Everything", instagram_title: "Train with us", related_title: "Stack it with", add_to_cart: "Add to cart" },
      announcement: "100% authentic supplements · Fast delivery across India",
      about: { title: "Built for your goals", text: "We stock only products we would use ourselves: genuine supplements with clear labels, and gym gear that lasts. Tell us your goal and we'll help you build the right stack." },
      faq: [
        { q: "Are your products original?", a: "Yes. We buy directly from brands and authorised distributors, and every batch has its original seal." },
        { q: "How do I choose a protein?", a: "DM us your goal (muscle gain, fat loss, general fitness) and your diet, and we'll suggest the right one." },
        { q: "How fast is delivery?", a: "Most orders ship within 24 hours and arrive in 2–6 working days." },
      ],
    },
  },
];

/** The home-page blocks each niche template shows, in order (the seller can reorder them: site.section_order). Mirrors backend HOME_BLOCKS. */
export const HOME_ORDER: Record<Exclude<TemplateId, "classic">, string[]> = {
  boutique: ["lookbook", "best", "tiles", "fresh", "story", "testimonials", "insta", "faq", "all"],
  jewellery: ["collections", "signature", "fresh", "story", "testimonials", "faq"],
  bakery: ["best", "steps", "fresh", "custom", "testimonials", "insta", "faq", "all"],
  beauty: ["benefits", "collections", "best", "fresh", "story", "testimonials", "faq", "all"],
  fitness: ["benefits", "collections", "best", "fresh", "testimonials", "story", "insta", "faq", "all"],
};
export const HOME_LABELS: Record<string, string> = {
  lookbook: "Shop the look (photo collage)", collections: "Collection tiles", tiles: "Shop by category", signature: "Top products grid", best: "Best sellers", fresh: "New arrivals",
  benefits: "Delivery & payment highlights", steps: "How ordering works", custom: "Custom order button", story: "Your story (About)", testimonials: "Customer reviews",
  insta: "Instagram photos", faq: "FAQ", all: "Shop-all button",
};
/** The block order to render: the seller's order where they set one, the template's own order for anything they haven't placed. */
export function homeOrder(id: TemplateId, saved: string[] | undefined): string[] {
  const base = id === "classic" ? [] : HOME_ORDER[id];
  if (!saved?.length) return base;
  const known = saved.filter((k) => base.includes(k));
  return [...known, ...base.filter((k) => !known.includes(k))];
}

export const isTemplateId = (v: unknown): v is TemplateId => typeof v === "string" && TEMPLATES.some((t) => t.id === v);
export const getTemplate = (id: string | undefined | null): StoreTemplate => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

/** The storefront as it would look in `id`: look only (template, colours, accent). Used by the preview page; nothing is saved. */
export function previewSite(site: ShopSite, id: TemplateId): ShopSite {
  const t = getTemplate(id);
  return { ...site, template: t.id, colors: t.colors, accent: t.accent };
}
export const previewStore = (store: PublicStore, id: TemplateId): PublicStore => ({ ...store, site: previewSite(store.site, id) });

export type ApplyOptions = { colours: boolean; starter: boolean };

/**
 * What "Use this template" does to the editor's site settings: by default only the layout (`template`). Opt-in: `colours` also takes the
 * template's colours; `starter` also fills the niche texts, announcement, About and FAQ — but only where the seller hasn't written their own
 * (a text still equal to its default, an empty announcement / About / FAQ). Banners, products, logo, policies and section toggles are never touched.
 * Nothing is saved here: the editor shows the result and the seller presses Save (or Undo).
 */
export function applyTemplate(site: ShopSite, id: TemplateId, defaultTexts: Record<SiteTextKey, string>, { colours, starter }: ApplyOptions): ShopSite {
  const t = getTemplate(id);
  const next: ShopSite = { ...site, template: t.id, ...(colours ? { colors: t.colors, accent: t.accent } : {}) };
  if (!starter) return next;
  const texts = { ...site.texts };
  for (const [k, v] of Object.entries(t.starter.texts) as [SiteTextKey, string][]) {
    if (!texts[k] || texts[k] === defaultTexts[k]) texts[k] = v;
  }
  next.texts = texts;
  if (!site.announcement.trim()) next.announcement = t.starter.announcement;
  if (!site.about.text.trim() && t.starter.about.text) next.about = { ...site.about, title: site.about.title || t.starter.about.title, text: t.starter.about.text };
  if (site.faq.length === 0 && t.starter.faq.length) next.faq = t.starter.faq;
  return next;
}
