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
    theme_color: "#ec4899",
    icons: [{ src: "/favicon-green.png", sizes: "512x512", type: "image/png" }],
  };
}
