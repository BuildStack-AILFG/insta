import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/accept-invite", "/reset-password", "/rotate-password", "/forgot-password"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
