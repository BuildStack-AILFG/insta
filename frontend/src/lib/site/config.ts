/** One place for everything the public site says about the company. Override per deployment with NEXT_PUBLIC_* env vars. */

const env = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);

export const SITE = {
  name: "DMForGrow",
  legalName: "ScaleDesk Technology Pvt Ltd",
  url: env(process.env.NEXT_PUBLIC_SITE_URL, "https://gramforgrow.in").replace(/\/$/, ""),
  tagline: "Instagram comment & DM automation for growing brands",
  description:
    "Turn Instagram comments into customers: comment-to-DM automation, story reply automation, a shared DM inbox, no-code DM flows, an AI agent trained on your knowledge base, a sales pipeline and payment links — on Meta's official Instagram API.",
  supportEmail: env(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, "support@gramforgrow.in"),
  /** Our own support line (customers can reach the DMForGrow team on WhatsApp). */
  whatsappNumber: "918810873052",
  /** Registered office. Shown on the contact, legal and invoice pages when set. */
  address: env(process.env.NEXT_PUBLIC_COMPANY_ADDRESS, ""),
  gstin: env(process.env.NEXT_PUBLIC_COMPANY_GSTIN, ""),
  cin: env(process.env.NEXT_PUBLIC_COMPANY_CIN, ""),
  /** Grievance Officer name shown in the Privacy Policy (DPDP Rules / IT Rules 2021). */
  grievanceOfficer: env(process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER, ""),
  twitter: "@gramforgrow",
  social: {
    linkedin: "https://www.linkedin.com/showcase/gramforgrow",
    youtube: "https://www.youtube.com/@ScaleDeskTechnologies",
    x: "https://x.com/gramforgrow",
    facebook: "https://www.facebook.com/gramforgrow",
  },
  /** ISO date the legal texts were last revised. Bump it whenever they change. */
  legalUpdated: "2026-10-01",
} as const;

export const whatsappLink = (text?: string) => `https://wa.me/${SITE.whatsappNumber}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export const absoluteUrl = (path = "/") => `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;

export const formatDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
