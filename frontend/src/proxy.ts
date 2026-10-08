import { NextResponse, type NextRequest } from "next/server";

/**
 * Shop custom domains: a request for shop.priyaboutique.com/p/123 is served by /s/priyas-boutique/p/123.
 * Our own hosts (and unknown domains) pass straight through. The API is asked which store owns a domain; answers are cached briefly.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api";
const EXTRA_HOSTS = (process.env.NEXT_PUBLIC_APP_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
const OWN = /(^|\.)(gramforgrow\.in|vercel\.app)$|^(localhost|127\.0\.0\.1|\[::1\])$/;
const TTL_MS = 60_000;
const cache = new Map<string, { slug: string | null; at: number }>();

async function storeFor(host: string): Promise<string | null> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.slug;
  let slug: string | null = null;
  try {
    const res = await fetch(`${API_URL}/public/store/by-domain/${encodeURIComponent(host)}`, { cache: "no-store" });
    slug = res.ok ? ((await res.json()) as { slug: string }).slug : null;
  } catch {
    return hit?.slug ?? null; // API unreachable: keep serving what we knew
  }
  cache.set(host, { slug, at: Date.now() });
  return slug;
}

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
  if (!host || OWN.test(host) || EXTRA_HOSTS.includes(host)) return NextResponse.next();
  const slug = await storeFor(host);
  if (!slug) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === `/s/${slug}` || pathname.startsWith(`/s/${slug}/`)) return NextResponse.next(); // the store's own links
  const url = request.nextUrl.clone();
  url.pathname = `/s/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml|manifest.webmanifest|og).*)"],
};
