import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Instagram, MessageCircle, Phone } from "lucide-react";
import type { PublicProduct, PublicStore } from "@/lib/api";
import { CartLink } from "./CartView";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api";

/** Server-side loader for the public store endpoints (no login, never cached: stock and prices change). */
export async function loadStore<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/public/store/${path}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export type StoreData = { store: PublicStore; products: PublicProduct[]; best_sellers: string[]; new_arrivals: string[] };
export type ProductData = { store: PublicStore; product: PublicProduct; related: PublicProduct[] };

/**
 * The seller's colours as CSS variables. Muted text, faint text, lines and soft fills are mixed from text + background, so any
 * combination (light, dark, cream…) stays consistent without picking a dozen shades.
 */
export function themeVars(site: PublicStore["site"]): CSSProperties {
  const c = site.colors;
  const mix = (pct: number) => `color-mix(in srgb, ${c.text} ${pct}%, ${c.background})`;
  return {
    "--bg": c.background, "--fg": c.text, "--surface": c.surface, "--accent": site.accent, "--accent-fg": c.button_text,
    "--muted": mix(62), "--faint": mix(40), "--line": mix(13), "--soft": mix(6), colorScheme: isDark(c.background) ? "dark" : "light",
  } as CSSProperties;
}

/** Relative luminance below ~0.4 → a dark background (for native form controls and scrollbars). */
export function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

/** wa.me link for the store's support number (Indian numbers may be saved without the country code). */
export function whatsappUrl(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

/**
 * The storefront template (white theme): announcement bar, sticky header with the cart, footer with policies and contact,
 * and a WhatsApp button. The seller's brand colour is exposed as --accent for every page inside it.
 */
export default function StoreShell({ store, children, home = false }: { store: PublicStore; children: ReactNode; home?: boolean }) {
  const { site } = store;
  const wa = store.support_phone ? whatsappUrl(store.support_phone) : null;
  const base = `/s/${store.slug}`;
  const nav = [
    { label: "Shop", href: `${base}#products`, on: true },
    { label: "About", href: `${base}#about`, on: site.sections.about && !!site.about.text },
    { label: "FAQ", href: `${base}#faq`, on: site.sections.faq },
  ].filter((n) => n.on);
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--fg)]" style={themeVars(site)}>
      {site.announcement && (
        <div className="bg-[var(--accent)] px-4 py-2 text-center text-[12.5px] font-medium text-[var(--accent-fg)]">{site.announcement}</div>
      )}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href={base} className="flex min-w-0 items-center gap-2.5">
            {store.logo_url
              ? <img src={store.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[var(--line)]" />
              : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[15px] font-bold text-[var(--accent-fg)]">{store.name.slice(0, 1)}</div>}
            <span className="truncate text-[17px] font-bold tracking-tight">{store.name}</span>
          </Link>
          <nav className="ml-6 hidden gap-6 text-[14px] text-[var(--muted)] md:flex">
            {nav.map((n) => <Link key={n.label} href={n.href} className="hover:text-[var(--fg)]">{n.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {store.instagram && (
              <a href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noreferrer" aria-label={`@${store.instagram} on Instagram`}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--fg)] hover:bg-[var(--soft)]"><Instagram size={19} /></a>
            )}
            <CartLink slug={store.slug} />
          </div>
        </div>
      </header>

      <div className={home ? "" : "mx-auto max-w-6xl px-4 pb-16"}>{children}</div>

      <footer className="mt-16 border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-[13.5px] text-[var(--muted)] sm:grid-cols-3">
          <div>
            <div className="mb-2 text-[15px] font-bold text-[var(--fg)]">{store.name}</div>
            {store.tagline && <p>{store.tagline}</p>}
            {store.instagram && <a href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 hover:text-[var(--fg)]"><Instagram size={14} /> @{store.instagram}</a>}
          </div>
          <div>
            <div className="mb-2 font-semibold text-[var(--fg)]">Help</div>
            <ul className="space-y-1.5">
              <li><Link href={`${base}/cart`} className="hover:text-[var(--fg)]">Your cart</Link></li>
              {site.sections.faq && <li><Link href={`${base}#faq`} className="hover:text-[var(--fg)]">FAQ</Link></li>}
              {store.instagram && <li>Track an order: DM us “track”</li>}
            </ul>
            {(site.policies.shipping || site.policies.returns) && (
              <div className="mt-3 space-y-2">
                {site.policies.shipping && <details><summary className="cursor-pointer hover:text-[var(--fg)]">Shipping policy</summary><p className="mt-1 whitespace-pre-line text-[12.5px]">{site.policies.shipping}</p></details>}
                {site.policies.returns && <details><summary className="cursor-pointer hover:text-[var(--fg)]">Returns &amp; refunds</summary><p className="mt-1 whitespace-pre-line text-[12.5px]">{site.policies.returns}</p></details>}
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 font-semibold text-[var(--fg)]">Contact</div>
            {store.support_phone && <div className="flex items-center gap-1.5"><Phone size={13} /> {store.support_phone}</div>}
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 hover:text-[var(--fg)]"><MessageCircle size={13} /> Chat on WhatsApp</a>}
            {store.instagram && <div className="mt-1.5">DM @{store.instagram} on Instagram</div>}
          </div>
        </div>
        <div className="border-t border-[var(--line)] py-4 text-center text-[12px] text-[var(--faint)]">
          © {store.name} · <Link href="/" className="hover:text-[var(--muted)]">Store by DMForGrow</Link>
        </div>
      </footer>

      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp"
          className="fixed bottom-5 right-5 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg shadow-black/15 transition hover:scale-105">
          <MessageCircle size={24} />
        </a>
      )}
    </main>
  );
}
