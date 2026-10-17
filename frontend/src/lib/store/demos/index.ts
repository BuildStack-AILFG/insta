import type { HeroSlide, PublicProduct, PublicStore, PublicVariant, ShopSite, SiteTextKey } from "@/lib/api";
import type { ProductData, StoreData } from "@/components/store/StoreShell";
import { getTemplate, isTemplateId, type TemplateId } from "../templates";

/**
 * Demo stores: one per template, fully filled (photos, products, banners, About, FAQ), served by the storefront at /s/demo-<template> so a
 * seller can click around a template like a live website. Photos are in /public/templates/<template>/ (see CREDITS.md there).
 * Demo stores are static: no database, no orders (checkout shows a demo notice), and the pages are noindex.
 */
export const DEMO_PREFIX = "demo-";
export const demoSlug = (id: TemplateId) => `${DEMO_PREFIX}${id}`;
export const isDemoSlug = (slug: string) => slug.startsWith(DEMO_PREFIX);

// Mirror of backend services/shop.py DEFAULT_TEXTS (the demo stores don't come from the API).
const DEFAULT_TEXTS: Record<SiteTextKey, string> = {
  hero_button: "Shop now", categories_title: "Shop by category", best_sellers_title: "Best sellers", best_sellers_subtitle: "What everyone's ordering",
  new_arrivals_title: "New arrivals", new_arrivals_subtitle: "Just landed in the store", all_products_title: "Shop all", instagram_title: "Shop our Instagram",
  instagram_subtitle: "Seen it on our feed? Tap to buy.", faq_title: "Questions? Answers.", related_title: "You may also like", add_to_cart: "Add to cart",
  buy_now: "Buy now", empty_store: "New products are coming soon.",
  lookbook_title: "Shop the look", lookbook_subtitle: "Pieces we love, styled together", testimonials_title: "What customers say", steps_title: "How ordering works",
  step1_title: "Pick what you love", step1_text: "Browse the menu and add your favourites to the basket.",
  step2_title: "Tell us the details", step2_text: "Choose delivery or pickup, and add a note for messages or allergies.",
  step3_title: "Enjoy it fresh", step3_text: "We bake to order and deliver it to your door.",
  custom_title: "Planning something special?", custom_text: "Custom cakes and bulk orders — tell us the occasion, flavour and date and we'll make it happen.", custom_button: "Request on Instagram",
};

type P = { name: string; rupees: number; was?: number; category: string; text: string; sizes?: string[]; second: number };
type Def = {
  id: TemplateId; num: number; name: string; tagline: string; instagram: string; phone: string; shipping: number; freeAbove: number;
  hero: { title: string; subtitle: string; cta: string }[]; products: P[]; aboutTitle: string; aboutText: string;
  faq: { q: string; a: string }[]; policies: { shipping: string; returns: string };
};

const SIZES = ["S", "M", "L", "XL"];

const DEFS: Def[] = [
  {
    id: "boutique", num: 1, name: "Saanvi Studio", tagline: "Handloom sarees & everyday ethnic wear · Jaipur", instagram: "saanvistudio", phone: "9876500001", shipping: 7900, freeAbove: 199900,
    hero: [
      { title: "The festive edit", subtitle: "Handcrafted ethnic wear for every celebration", cta: "Shop festive wear" },
      { title: "New season, new colours", subtitle: "Easy silhouettes in soft cotton and silk", cta: "Explore the edit" },
      { title: "Visit our studio", subtitle: "Handpicked pieces from weavers across India", cta: "Shop sarees" },
    ],
    products: [
      { name: "Handloom cotton saree", rupees: 2899, was: 3499, category: "Sarees", text: "A soft handloom cotton saree in a rich red with a hand-woven striped pallu. Lightweight, breathable and easy to drape.", second: 3 },
      { name: "Block-print cotton fabric set", rupees: 1899, category: "Kurtas & Sets", text: "Hand block-printed cotton, 2.5 m each, ready to be stitched into a kurta or a co-ord set. Colours stay bright after washing.", second: 5 },
      { name: "Ikat silk saree", rupees: 3299, category: "Sarees", text: "Hand-woven ikat in silk with a bold pattern and a contrast border. Each saree is slightly unique.", second: 4 },
      { name: "Zari border silk saree", rupees: 4999, category: "Sarees", text: "Rich silk with a woven zari border and a blouse piece. A saree for weddings and festive evenings.", second: 1 },
      { name: "Block-print cotton dupatta", rupees: 899, category: "Dupattas", text: "A soft cotton dupatta with delicate hand block prints. Dress up a plain kurta in seconds.", second: 2 },
      { name: "Printed summer tops", rupees: 1299, category: "Tops & Dresses", text: "Breezy printed tops in soft crepe. Wear them with jeans, skirts or palazzos.", sizes: SIZES, second: 7 },
      { name: "Printed blouse", rupees: 1499, category: "Tops & Dresses", text: "A relaxed printed blouse with a flattering fit. Pairs with sarees as well as trousers.", sizes: SIZES, second: 6 },
      { name: "Cotton knit cardigan", rupees: 1599, was: 1999, category: "Tops & Dresses", text: "A cosy knit cardigan for cooler evenings. Pairs with both ethnic and western outfits.", sizes: SIZES, second: 7 },
    ],
    aboutTitle: "Our story", aboutText: "Saanvi Studio began in a small Jaipur workshop with a simple idea: beautiful clothes made by skilled hands, at fair prices. We work with weavers and block-printers across India and finish every piece in small batches, so what reaches you is carefully checked and made to last.",
    faq: [
      { q: "How do I find my size?", a: "Each product page lists the sizes available. If you're unsure, DM us your measurements on Instagram and we'll help you choose." },
      { q: "Can I exchange an item?", a: "Yes. Message us within 3 days of delivery and we'll arrange an exchange for unworn items with tags." },
      { q: "How long does delivery take?", a: "Most orders ship within 2 days and arrive in 3–7 working days." },
    ],
    policies: { shipping: "Orders ship within 2 working days. Free delivery above ₹1,999.", returns: "Exchanges within 3 days of delivery for unworn items with tags." },
  },
  {
    id: "jewellery", num: 2, name: "Aarna Jewels", tagline: "Handcrafted jewellery for every occasion · Hyderabad", instagram: "aarnajewels", phone: "9876500002", shipping: 0, freeAbove: 0,
    hero: [
      { title: "Crafted to be kept", subtitle: "Handmade jewellery for the moments that matter", cta: "Discover the collection" },
      { title: "Wedding season", subtitle: "Statement sets for every ceremony", cta: "Shop bridal" },
      { title: "Temple jewellery", subtitle: "Traditional designs, made by master artisans", cta: "Shop jhumkas" },
    ],
    products: [
      { name: "Antique gold jhumkas", rupees: 1899, was: 2299, category: "Jhumkas", text: "Hand-finished antique gold-tone jhumkas with fine filigree work. Lightweight enough for all-day wear.", second: 2 },
      { name: "Temple jhumkas", rupees: 2499, category: "Jhumkas", text: "Traditional temple-style jhumkas with ruby-tone stones. A festive favourite.", second: 1 },
      { name: "Two-tone hoops", rupees: 999, category: "Hoops", text: "Chunky two-tone hoops that go from office to evening. Hypoallergenic posts.", second: 4 },
      { name: "Polki flower studs", rupees: 1299, category: "Studs", text: "Sparkling polki-style studs set in a flower design. Perfect for gifting.", second: 7 },
      { name: "Classic pearl necklace", rupees: 3499, was: 3999, category: "Necklaces", text: "A timeless strand of lustrous pearls with a secure clasp. Comes in a gift box.", second: 6 },
      { name: "Pearl-drop pendant", rupees: 1699, category: "Necklaces", text: "A delicate pendant with a single pearl drop on a fine chain.", second: 5 },
      { name: "Teardrop gold studs", rupees: 899, category: "Studs", text: "Smooth teardrop studs with a polished gold finish. Everyday luxury.", second: 3 },
      { name: "Pearl strand necklace", rupees: 2799, category: "Necklaces", text: "A graceful strand necklace with creamy pearls. Layers well with chains.", second: 5 },
    ],
    aboutTitle: "Made by hand, made to last", aboutText: "Every piece at Aarna Jewels is designed in our Hyderabad studio and finished by hand. We use skin-friendly materials and check each item before it leaves us, so it reaches you ready to wear or ready to gift.",
    faq: [
      { q: "Is the jewellery skin-safe?", a: "Yes. We use skin-friendly, nickel-free materials. Keep pieces dry and store them in the pouch provided." },
      { q: "Do you offer gift wrapping?", a: "Every order comes in a gift-ready box. Tell us on Instagram if you'd like a note added." },
      { q: "What if my order arrives damaged?", a: "Send us a photo within 48 hours of delivery and we'll replace it." },
    ],
    policies: { shipping: "Free insured delivery on every order. Ships within 2 working days.", returns: "Replacement for damaged items within 48 hours of delivery." },
  },
  {
    id: "bakery", num: 3, name: "Sweet Crumb Bakehouse", tagline: "Cakes, cupcakes & celebration bakes · Pune", instagram: "sweetcrumbbakehouse", phone: "9876500003", shipping: 5000, freeAbove: 99900,
    hero: [
      { title: "Baked fresh, just for you", subtitle: "Cakes, cupcakes and celebration bakes made to order", cta: "Order now" },
      { title: "Birthday cakes", subtitle: "Tell us the occasion, we'll bake the rest", cta: "See cakes" },
      { title: "Black forest, but better", subtitle: "Layered, fruity and fresh", cta: "Order a cake" },
    ],
    products: [
      { name: "Chocolate celebration cake", rupees: 899, category: "Cakes", text: "Rich chocolate sponge with ganache and a candle for your wish. Serves 6–8. Order a day ahead.", second: 2 },
      { name: "Black forest cake", rupees: 999, was: 1199, category: "Cakes", text: "Layers of chocolate sponge, cream and cherries. Serves 6–8.", second: 1 },
      { name: "Vanilla chocolate-drip cake", rupees: 849, category: "Cakes", text: "Soft vanilla sponge with a glossy chocolate drip. Serves 6–8.", second: 4 },
      { name: "Chocolate mousse cake", rupees: 1099, category: "Cakes", text: "Silky chocolate mousse on a cocoa base with sprinkles. Serves 8–10.", second: 3 },
      { name: "Chocolate cupcakes (box of 6)", rupees: 549, category: "Cupcakes", text: "Fudgy chocolate cupcakes with swirled frosting. Baked fresh the same day.", second: 6 },
      { name: "Vanilla sprinkle cupcakes (box of 6)", rupees: 499, category: "Cupcakes", text: "Light vanilla cupcakes topped with buttercream and sprinkles.", second: 7 },
      { name: "Pastel party cupcakes (box of 12)", rupees: 999, was: 1198, category: "Party boxes", text: "A colourful box of 12 pastel cupcakes. Perfect for parties and office treats.", second: 5 },
      { name: "Rose birthday cake", rupees: 1299, category: "Cakes", text: "A chocolate cake decorated with buttercream roses. Add a message at checkout. Serves 8–10.", second: 1 },
    ],
    aboutTitle: "Baked with love", aboutText: "Everything at Sweet Crumb is made in our home kitchen in Pune, in small batches, using real butter and fresh ingredients. Tell us about your celebration and we'll bake something special for it.",
    faq: [
      { q: "How early should I order?", a: "Cakes need at least 24 hours' notice; custom designs, 2–3 days. Cupcakes can usually ship the next day." },
      { q: "Do you deliver across the city?", a: "Yes. Delivery charges depend on distance and are shown at checkout." },
      { q: "How should I store my order?", a: "Keep cakes refrigerated and bring them to room temperature 30 minutes before serving. Eat within 2 days." },
    ],
    policies: { shipping: "We deliver across Pune. Free delivery above ₹999.", returns: "Due to the nature of food, we can't accept returns. If something isn't right, message us the same day." },
  },
  {
    id: "beauty", num: 4, name: "Veda Botanics", tagline: "Simple skincare, haircare & wellness · Bengaluru", instagram: "vedabotanics", phone: "9876500004", shipping: 4900, freeAbove: 79900,
    hero: [
      { title: "Simple, honest skincare", subtitle: "Products that work, with ingredients you can read", cta: "Shop the range" },
      { title: "Your daily ritual", subtitle: "Cleanse, treat and protect in three easy steps", cta: "Shop skincare" },
      { title: "Healthy hair, naturally", subtitle: "Oils and cleansers made with botanicals", cta: "Shop hair care" },
    ],
    products: [
      { name: "Radiance Vitamin C serum", rupees: 799, was: 999, category: "Skincare", text: "A lightweight Vitamin C serum for a brighter, more even-looking complexion. Use every morning.", second: 2 },
      { name: "Hyaluronic gel serum", rupees: 649, category: "Skincare", text: "A cooling gel serum that deeply hydrates without feeling sticky.", second: 7 },
      { name: "Daily body lotion", rupees: 449, category: "Skincare", text: "A fast-absorbing body lotion with shea butter. Non-greasy and lightly scented.", second: 1 },
      { name: "Rosemary hair growth oil", rupees: 549, was: 699, category: "Hair care", text: "A blend of rosemary, cloves and moringa in cold-pressed oils. Massage into the scalp twice a week.", second: 6 },
      { name: "Botanical shampoo", rupees: 499, category: "Hair care", text: "A gentle sulphate-free shampoo that cleanses without stripping.", second: 4 },
      { name: "Cold-pressed castor oil", rupees: 399, category: "Hair care", text: "Pure cold-pressed castor oil for hair, brows and lashes.", second: 5 },
      { name: "Hydrating essence serum", rupees: 899, category: "Skincare", text: "A silky essence that preps skin for moisturiser and keeps it plump.", second: 1 },
      { name: "Vitamin D3 gummies", rupees: 599, category: "Wellness", text: "Easy-to-take Vitamin D3 gummies to support bones and immunity. 60 gummies.", second: 3 },
    ],
    aboutTitle: "Honest, effective care", aboutText: "We started Veda Botanics because we were tired of long ingredient lists and big claims. Everything we sell is sourced from trusted makers, with clear labels and honest results, so you know exactly what you're putting on and in your body.",
    faq: [
      { q: "Are your products authentic?", a: "Yes. We source directly from makers, and every batch is checked before dispatch." },
      { q: "How do I know what suits me?", a: "DM us on Instagram with your skin type or goal and we'll recommend the right product." },
      { q: "What is your return policy?", a: "Unopened items can be returned within 7 days of delivery. For safety, opened products can't be returned." },
    ],
    policies: { shipping: "Orders ship within 24 hours. Free delivery above ₹799.", returns: "Unopened items can be returned within 7 days of delivery." },
  },
  {
    id: "fitness", num: 5, name: "IronFuel Nutrition", tagline: "Protein, supplements & gym gear · Delhi", instagram: "ironfuelnutrition", phone: "9876500005", shipping: 0, freeAbove: 0,
    hero: [
      { title: "Fuel your training", subtitle: "Authentic supplements and gym gear, delivered fast", cta: "Shop now" },
      { title: "Build the stack", subtitle: "Protein, creatine and pre-workout from trusted brands", cta: "Shop supplements" },
      { title: "Train anywhere", subtitle: "Dumbbells, bands and accessories", cta: "Shop gear" },
    ],
    products: [
      { name: "Whey protein 1 kg", rupees: 2499, was: 2799, category: "Protein", text: "24 g of protein per scoop with a smooth, mixable texture. 33 servings.", second: 2 },
      { name: "Plant protein 500 g", rupees: 1899, category: "Protein", text: "A vegan protein blend with 21 g of protein per serving. No added sugar.", second: 1 },
      { name: "Creatine monohydrate 250 g", rupees: 999, category: "Pre & post", text: "Micronised creatine monohydrate for strength and power. 50 servings.", second: 7 },
      { name: "Protein shaker 700 ml", rupees: 399, category: "Accessories", text: "A leak-proof shaker with a steel agitator ball. BPA-free.", second: 8 },
      { name: "Hex dumbbells (pair)", rupees: 1299, category: "Equipment", text: "Rubber-coated hex dumbbells that won't roll. Available in 2–20 kg.", second: 6 },
      { name: "Dumbbell & resistance band kit", rupees: 1599, was: 1999, category: "Equipment", text: "A compact home-workout kit: a pair of dumbbells and a resistance band.", second: 5 },
      { name: "Pre-workout 300 g", rupees: 1699, was: 1999, category: "Pre & post", text: "A clean energy pre-workout with caffeine and beta-alanine. Mix with water 20 minutes before training.", second: 3 },
      { name: "Black gym shaker", rupees: 449, category: "Accessories", text: "A sturdy black shaker with a flip cap. Fits in most bottle holders.", second: 4 },
    ],
    aboutTitle: "Built for your goals", aboutText: "IronFuel stocks only products we would use ourselves: genuine supplements with clear labels, and gym gear that lasts. Tell us your goal and we'll help you build the right stack.",
    faq: [
      { q: "Are your products original?", a: "Yes. We buy directly from brands and authorised distributors, and every product has its original seal." },
      { q: "How do I choose a protein?", a: "DM us your goal (muscle gain, fat loss, general fitness) and your diet, and we'll suggest the right one." },
      { q: "How fast is delivery?", a: "Most orders ship within 24 hours and arrive in 2–6 working days." },
    ],
    policies: { shipping: "Free delivery on every order. Ships within 24 hours.", returns: "Unopened supplements can be returned within 7 days of delivery." },
  },
];

// Fictional customer reviews, for the demo stores only (they are never copied into a seller's own store).
const TESTIMONIALS: Record<string, { name: string; text: string }[]> = {
  boutique: [
    { name: "Meera K.", text: "The saree fabric is even softer than it looks in the photos. Packaging was lovely and it arrived in 3 days." },
    { name: "Anjali R.", text: "Ordered two kurtas for Diwali. Perfect fit and the prints haven't faded after washing." },
    { name: "Divya S.", text: "They helped me pick the right size over a quick DM. Great service for a small brand!" },
  ],
  jewellery: [
    { name: "Priya N.", text: "The jhumkas look exactly like the pictures and are so light. I wore them all day at a wedding." },
    { name: "Sneha M.", text: "Beautiful gift box. My sister loved the pearl necklace." },
    { name: "Kavya T.", text: "Fast delivery and the polish still looks new after a month." },
  ],
  bakery: [
    { name: "Rohit P.", text: "The black forest cake was fresh and not too sweet. Everyone at the party asked where it was from." },
    { name: "Neha D.", text: "Ordered cupcakes for my daughter's birthday. They arrived on time and looked adorable." },
    { name: "Farah A.", text: "Custom cake exactly how I described it. Will order again." },
  ],
  beauty: [
    { name: "Ishita G.", text: "My skin feels so much better after a month of the Vitamin C serum. Light and not sticky." },
    { name: "Ritu B.", text: "The hair oil smells natural and my hair fall has reduced. Genuine products." },
    { name: "Pooja V.", text: "Quick delivery and they replied to all my skin questions on Instagram." },
  ],
  fitness: [
    { name: "Aman S.", text: "Original whey with a sealed tub and the batch code checked out. Delivered in 2 days." },
    { name: "Vikram J.", text: "Good prices on dumbbells and the shaker doesn't leak. Solid." },
    { name: "Rhea C.", text: "They recommended the right protein for my goal. Mixes smooth with no lumps." },
  ],
};

const uuid = (num: number, i: number) => `de00${num}000-0000-4000-8000-${String(i).padStart(12, "0")}`;

function build(d: Def): { data: StoreData; products: PublicProduct[] } {
  const t = getTemplate(d.id);
  const img = (n: number) => `/templates/${d.id}/p${n}.jpg`;
  const products: PublicProduct[] = d.products.map((p, i) => {
    const id = uuid(d.num, i + 1);
    const price = p.rupees * 100;
    const variants: PublicVariant[] = (p.sizes ?? []).map((s, k) => ({ id: uuid(d.num, 100 + i * 10 + k), title: s, options: { Size: s }, price, sold_out: false }));
    return {
      id, name: p.name, description: p.text, category: p.category, price, price_varies: false, compare_at_price: p.was ? p.was * 100 : null, image_url: img(i + 1),
      permalink: null, sold_out: false, options: p.sizes ? [{ name: "Size", values: p.sizes }] : [], variants, images: [img(i + 1), img(p.second)],
    };
  });
  const hero: HeroSlide[] = d.hero.map((h, i) => ({ image_url: `/templates/${d.id}/hero-${i + 1}.jpg`, title: h.title, subtitle: h.subtitle, cta_label: h.cta, product_id: null }));
  const site: ShopSite = {
    template: d.id, accent: t.accent, colors: t.colors, texts: { ...DEFAULT_TEXTS, ...t.starter.texts }, announcement: t.starter.announcement, hero,
    about: { title: d.aboutTitle, text: d.aboutText, image_url: `/templates/${d.id}/about.jpg` }, faq: d.faq,
    sections: { categories: true, best_sellers: true, new_arrivals: true, all_products: true, instagram: true, about: true, testimonials: true, faq: true }, policies: d.policies,
    testimonials: TESTIMONIALS[d.id] ?? [], size_guide: d.id === "boutique" ? "S: bust 34 in · M: bust 36 in · L: bust 38 in · XL: bust 40 in\nAll sizes include 1 in of ease. Not sure? DM us your measurements." : "",
    photo_fit: "cover", section_order: [], grid_columns: 4, hero_height: "normal",
  };
  const store: PublicStore = {
    slug: demoSlug(d.id), name: d.name, tagline: d.tagline, logo_url: null, instagram: d.instagram, support_phone: d.phone, shipping_fee: d.shipping,
    free_shipping_above: d.freeAbove || null, payment_methods: ["online", "cod"], site,
  };
  const firstOf = (cat: string) => products.find((p) => p.category === cat)?.image_url as string;
  const covers = Object.fromEntries([...new Set(products.map((p) => p.category))].map((c) => [c, firstOf(c)]));
  // Product photos with permalinks feed the Instagram strip; point them at the (inert) demo.
  const withLinks = products.map((p, i) => (i < 6 ? { ...p, permalink: `https://instagram.com/${d.instagram}` } : p));
  return {
    products: withLinks,
    data: { store, products: withLinks, category_images: covers, best_sellers: withLinks.slice(0, 4).map((p) => p.id), new_arrivals: withLinks.slice(4).map((p) => p.id) },
  };
}

const BUILT = new Map(DEFS.map((d) => [demoSlug(d.id), build(d)]));

export const DEMO_TEMPLATES: TemplateId[] = DEFS.map((d) => d.id);

/** The home/shop data for a demo slug, or null if it isn't one. */
export function getDemo(slug: string): StoreData | null {
  return BUILT.get(slug)?.data ?? null;
}

/** The product page data for a demo product, or null. */
export function getDemoProduct(slug: string, id: string): ProductData | null {
  const b = BUILT.get(slug);
  const product = b?.products.find((p) => p.id === id);
  if (!b || !product) return null;
  return { store: b.data.store, product, related: b.products.filter((p) => p.id !== id).slice(0, 4) };
}

/** Name search for the navbar (demo stores have no API). */
export function searchDemo(slug: string, term: string): PublicProduct[] {
  const q = term.toLowerCase();
  return (BUILT.get(slug)?.products ?? []).filter((p) => `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)).slice(0, 8);
}

export const demoTemplateOf = (slug: string): TemplateId | null => {
  const id = slug.slice(DEMO_PREFIX.length);
  return isDemoSlug(slug) && isTemplateId(id) && BUILT.has(slug) ? id : null;
};
