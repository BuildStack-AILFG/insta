import localFont from "next/font/local";
import type { Metadata } from "next";
import "../store-templates.css";
import { isDemoSlug } from "@/lib/store/demos";

// Display fonts for the niche storefront templates (see lib/store/templates.ts). Loaded only for /s/* pages, and the browser downloads a
// font file only when a store actually uses it, so the classic template and the rest of the site are unaffected.
const playfair = localFont({ src: "../../../fonts/PlayfairDisplay-Variable.woff2", weight: "400 900", display: "swap", preload: false, variable: "--font-playfair" });
const cormorant = localFont({ src: "../../../fonts/CormorantGaramond-Variable.woff2", weight: "300 700", display: "swap", preload: false, variable: "--font-cormorant" });
const fredoka = localFont({ src: "../../../fonts/Fredoka-Variable.woff2", weight: "300 700", display: "swap", preload: false, variable: "--font-fredoka" });
const outfit = localFont({ src: "../../../fonts/Outfit-Variable.woff2", weight: "100 900", display: "swap", preload: false, variable: "--font-outfit" });
const barlow = localFont({
  src: [
    { path: "../../../fonts/BarlowCondensed-500.woff2", weight: "500" },
    { path: "../../../fonts/BarlowCondensed-600.woff2", weight: "600" },
    { path: "../../../fonts/BarlowCondensed-700.woff2", weight: "700" },
    { path: "../../../fonts/BarlowCondensed-800.woff2", weight: "800" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-barlow",
});

/** Demo stores (/s/demo-<template>) are for looking at templates, not for search engines. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return isDemoSlug(slug) ? { robots: { index: false, follow: false } } : {};
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${playfair.variable} ${cormorant.variable} ${fredoka.variable} ${outfit.variable} ${barlow.variable}`}>{children}</div>;
}
