import { Barlow_Condensed, Cormorant_Garamond, Fredoka, Outfit, Playfair_Display } from "next/font/google";
import type { Metadata } from "next";
import "../store-templates.css";
import { isDemoSlug } from "@/lib/store/demos";

// Display fonts for the niche storefront templates (see lib/store/templates.ts). Loaded only for /s/* pages, and the browser downloads a
// font file only when a store actually uses it, so the classic template and the rest of the site are unaffected.
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-playfair", weight: ["400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-cormorant", weight: ["400", "500", "600", "700"] });
const fredoka = Fredoka({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-fredoka", weight: ["400", "500", "600", "700"] });
const outfit = Outfit({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-outfit", weight: ["400", "500", "600", "700"] });
const barlow = Barlow_Condensed({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-barlow", weight: ["500", "600", "700", "800"] });

/** Demo stores (/s/demo-<template>) are for looking at templates, not for search engines. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return isDemoSlug(slug) ? { robots: { index: false, follow: false } } : {};
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${playfair.variable} ${cormorant.variable} ${fredoka.variable} ${outfit.variable} ${barlow.variable}`}>{children}</div>;
}
