import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Blessings (slug "blessings") has its own landing page in public/blessing-site; its shop pages (/s/blessings/shop, /p/…, cart, order) stay on the normal store.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/s/blessings", destination: "/blessing-landing" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
