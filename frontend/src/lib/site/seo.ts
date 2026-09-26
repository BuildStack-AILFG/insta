import type { Metadata } from "next";
import { absoluteUrl, SITE } from "./config";

export type Faq = { q: string; a: string };

/** Block-based long-form content (blog, docs, legal). Inline text supports **bold**, `code` and [links](/path). */
export type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "callout"; title?: string; text: string; tone?: "info" | "warn" | "tip" }
  | { type: "code"; text: string; lang?: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "quote"; text: string; by?: string };

type MetaInput = {
  title: string;
  description: string;
  path: string;
  /** Short heading printed on the generated share image; defaults to the title. */
  ogTitle?: string;
  ogKind?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  keywords?: string[];
  noindex?: boolean;
};

/** Per-page metadata with a canonical URL, Open Graph, Twitter card and a generated share image. */
export function pageMetadata(m: MetaInput): Metadata {
  const url = absoluteUrl(m.path);
  // Brand the title when it fits comfortably in a search result (~65 characters); otherwise the page's own keywords win.
  const full = m.title.includes(SITE.name) || m.title.length + SITE.name.length + 3 > 65 ? m.title : `${m.title} | ${SITE.name}`;
  const image = `/og?title=${encodeURIComponent(m.ogTitle ?? m.title)}&kind=${encodeURIComponent(m.ogKind ?? "")}`;
  return {
    title: { absolute: full },
    description: m.description,
    keywords: m.keywords,
    alternates: { canonical: url },
    robots: m.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: m.type ?? "website",
      url,
      siteName: SITE.name,
      title: full,
      description: m.description,
      locale: "en_IN",
      images: [{ url: image, width: 1200, height: 630, alt: m.title }],
      ...(m.publishedTime ? { publishedTime: m.publishedTime } : {}),
      ...(m.modifiedTime ? { modifiedTime: m.modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", site: SITE.twitter, title: full, description: m.description, images: [image] },
  };
}

// ---- JSON-LD builders ---------------------------------------------------------------------------------------------------------

export const organizationLd = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": absoluteUrl("/#organization"),
  name: SITE.name,
  legalName: SITE.legalName,
  url: SITE.url,
  logo: absoluteUrl("/logo-mark.png"),
  description: SITE.description,
  email: SITE.supportEmail,
  sameAs: Object.values(SITE.social),
  ...(SITE.address ? { address: { "@type": "PostalAddress", streetAddress: SITE.address, addressCountry: "IN" } } : {}),
  contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: SITE.supportEmail, areaServed: "IN", availableLanguage: ["en", "hi"] }],
  parentOrganization: { "@type": "Organization", name: SITE.legalName },
});

export const websiteLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": absoluteUrl("/#website"),
  url: SITE.url,
  name: SITE.name,
  publisher: { "@id": absoluteUrl("/#organization") },
  inLanguage: "en-IN",
});

export const softwareLd = (offers: { name: string; price: number; description?: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: SITE.description,
  url: SITE.url,
  publisher: { "@id": absoluteUrl("/#organization") },
  offers: offers.map((o) => ({ "@type": "Offer", name: o.name, price: String(o.price), priceCurrency: "INR", description: o.description, url: absoluteUrl("/pricing"), availability: "https://schema.org/InStock" })),
});

export const breadcrumbLd = (trail: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [{ name: "Home", path: "/" }, ...trail].map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: absoluteUrl(t.path) })),
});

export const faqLd = (faqs: Faq[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

export const articleLd = (a: { title: string; description: string; path: string; published: string; modified?: string; author: string; section: string }) => ({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: a.title,
  description: a.description,
  mainEntityOfPage: absoluteUrl(a.path),
  url: absoluteUrl(a.path),
  datePublished: a.published,
  dateModified: a.modified ?? a.published,
  articleSection: a.section,
  author: { "@type": "Organization", name: a.author },
  publisher: { "@id": absoluteUrl("/#organization") },
  image: absoluteUrl(`/og?title=${encodeURIComponent(a.title)}&kind=Blog`),
  inLanguage: "en-IN",
});
