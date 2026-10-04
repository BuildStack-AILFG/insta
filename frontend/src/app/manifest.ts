import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — Instagram Automation`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#e91e78",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
