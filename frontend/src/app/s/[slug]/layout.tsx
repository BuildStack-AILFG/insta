import { Cormorant_Garamond, Fredoka, Outfit, Playfair_Display } from "next/font/google";
import "../store-templates.css";

// Display fonts for the niche storefront templates (see lib/store/templates.ts). Loaded only for /s/* pages, and the browser downloads a
// font file only when a store actually uses it, so the classic template and the rest of the site are unaffected.
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-playfair", weight: ["400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-cormorant", weight: ["400", "500", "600", "700"] });
const fredoka = Fredoka({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-fredoka", weight: ["400", "500", "600", "700"] });
const outfit = Outfit({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-outfit", weight: ["400", "500", "600", "700"] });

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${playfair.variable} ${cormorant.variable} ${fredoka.variable} ${outfit.variable}`}>{children}</div>;
}
