import type { ReactNode } from "react";
import Footer from "@/components/landing/Footer";
import { COMPANY_LINKS, PRODUCT_LINKS, RESOURCE_LINKS, SOLUTION_LINKS } from "@/lib/site/nav";
import SiteHeader from "./SiteHeader";

const GROUPS = [
  { id: "product", label: "Product", links: PRODUCT_LINKS, wide: true },
  { id: "solutions", label: "Solutions", links: SOLUTION_LINKS, wide: true },
  { id: "resources", label: "Resources", links: RESOURCE_LINKS },
  { id: "company", label: "Company", links: COMPANY_LINKS },
];

/** Header + page + footer for every public page except the homepage (which composes the same pieces itself). */
export default function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <a href="#main" className="sr-only z-[60] rounded-lg bg-brand px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <SiteHeader groups={GROUPS} />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
