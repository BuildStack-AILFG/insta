import Link from "next/link";
import type { ReactNode } from "react";
import { Instagram, Phone } from "lucide-react";
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

export type StoreData = { store: PublicStore; products: PublicProduct[] };
export type ProductData = { store: PublicStore; product: PublicProduct };

/** The public storefront's frame: a header with the brand, and a footer with how to reach them. */
export default function StoreShell({ store, children }: { store: PublicStore; children: ReactNode }) {
  return (
    <main className="theme-fixed min-h-screen bg-gradient-to-b from-[#2a0a1c] via-black to-[#1a0610] text-white">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-2 pt-8">
        <Link href={`/s/${store.slug}`} className="flex min-w-0 items-center gap-3">
          {store.logo_url
            ? <img src={store.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-pink-500/70" />
            : <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-pink-500 to-orange-400" />}
          <div className="min-w-0">
            <div className="truncate text-[18px] font-bold">{store.name}</div>
            {store.tagline && <div className="truncate text-[13px] text-white/60">{store.tagline}</div>}
          </div>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {store.instagram && (
            <a href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12.5px] text-white/80 hover:border-pink-400/60">
              <Instagram size={14} /> <span className="hidden sm:inline">@{store.instagram}</span>
            </a>
          )}
          <CartLink slug={store.slug} />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 pb-16">{children}</div>
      <footer className="mx-auto max-w-5xl border-t border-white/10 px-4 py-8 text-center text-[12px] text-white/40">
        {store.support_phone && <div className="mb-2 flex items-center justify-center gap-1.5"><Phone size={12} /> Questions? Call or WhatsApp {store.support_phone}</div>}
        <Link href="/" className="hover:text-white/70">Store by GramForGrow</Link>
      </footer>
    </main>
  );
}
