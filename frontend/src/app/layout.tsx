import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { JsonLd } from "@/components/site/blocks";
import { SITE } from "@/lib/site/config";
import { organizationLd, websiteLd } from "@/lib/site/seo";
import { THEME_INIT_SCRIPT } from "@/lib/themeConfig";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — Instagram Comment & DM Automation`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  creator: SITE.legalName,
  publisher: SITE.legalName,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_IN",
    images: [{ url: "/og", width: 1200, height: 630, alt: `${SITE.name} — ${SITE.tagline}` }],
  },
  twitter: { card: "summary_large_image", site: SITE.twitter, creator: SITE.twitter, images: ["/og"] },
  formatDetection: { telephone: false },
  // Icons come from the app/favicon.ico, app/icon.png and app/apple-icon.png file conventions.
};

export const viewport: Viewport = { themeColor: "#e91e78" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the inline script below sets data-theme before React hydrates.
    <html lang="en" className={`${plusJakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <JsonLd data={[organizationLd(), websiteLd()]} />
        {children}
      </body>
    </html>
  );
}
