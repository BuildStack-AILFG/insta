/** Navigation for the public site header and footer. Feature/solution entries are generated from their content files. */

import { FEATURES } from "./features";
import { SOLUTIONS } from "./solutions";

export type NavLink = { label: string; href: string; description?: string };

export const PRODUCT_LINKS: NavLink[] = FEATURES.map((f) => ({ label: f.navLabel, href: `/features/${f.slug}`, description: f.tagline }));
export const SOLUTION_LINKS: NavLink[] = SOLUTIONS.map((s) => ({ label: s.navLabel, href: `/solutions/${s.slug}`, description: s.tagline }));

export const RESOURCE_LINKS: NavLink[] = [
  { label: "Blog", href: "/blog", description: "Playbooks and how-tos for growing on Instagram" },
  { label: "Documentation", href: "/docs", description: "Guides and the developer API reference" },
  { label: "Help Center", href: "/help", description: "Answers to common questions" },
  { label: "Product updates", href: "/changelog", description: "What we shipped and when" },
  { label: "System status", href: "/status", description: "Live health of the platform" },
];

export const COMPANY_LINKS: NavLink[] = [
  { label: "About us", href: "/about" },
  { label: "Careers", href: "/careers" },
  { label: "Partners", href: "/partners" },
  { label: "Contact", href: "/contact" },
];

export const TRUST_LINKS: NavLink[] = [
  { label: "Security", href: "/security" },
  { label: "Compliance", href: "/compliance" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Refund Policy", href: "/refund-policy" },
  { label: "Cookie Policy", href: "/cookies" },
  { label: "Accessibility", href: "/accessibility" },
];
