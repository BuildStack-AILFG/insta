import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { NextRequest } from "next/server";

/** Serves public/blessing-site/index.html for /s/blessings (see the rewrite in next.config.ts). OpenNext can't rewrite straight to a static file, so on Cloudflare we read it from the assets binding. */
export async function GET(req: NextRequest) {
  try {
    const { env } = getCloudflareContext();
    const assets = (env as { ASSETS?: { fetch: (url: URL) => Promise<Response> } }).ASSETS;
    if (assets) {
      const res = await assets.fetch(new URL("/blessing-site/", req.url));
      return new Response(res.body, { status: res.status, headers: { "content-type": "text/html; charset=utf-8" } });
    }
  } catch {
    // not running on Cloudflare (next dev / next start)
  }
  const res = await fetch(new URL("/blessing-site/index.html", req.url));
  return new Response(res.body, { status: res.status, headers: { "content-type": "text/html; charset=utf-8" } });
}
