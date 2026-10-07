"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import type { NavLink } from "@/lib/site/nav";
import BrandLogo from "@/components/ui/BrandLogo";

type Group = { id: string; label: string; links: NavLink[]; wide?: boolean };

/** Public-site header: same look as the homepage bar, but with real page links, keyboard-accessible menus and a mobile drawer. */
export default function SiteHeader({ groups }: { groups: Group[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(null); setMobile(false); }, [pathname]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (bar.current && !bar.current.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setMobile(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, []);
  useEffect(() => { document.body.style.overflow = mobile ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [mobile]);

  const linkCls = "inline-flex items-center py-1 text-[14px] font-medium text-white/90 transition-colors hover:text-white";

  return (
    <header className="fixed left-0 right-0 top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-5">
      <div ref={bar} className="relative mx-auto flex max-w-[1180px] items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/70 px-4 py-2.5 shadow-[0_4px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-5">
        <Link href="/" className="ml-1 shrink-0" aria-label="DMForGrow home"><BrandLogo /></Link>

        <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-6 lg:flex xl:gap-8">
          {groups.map((g) => (
            <div key={g.id} className="relative" onMouseEnter={() => setOpen(g.id)} onMouseLeave={() => setOpen((o) => (o === g.id ? null : o))}>
              <button type="button" aria-expanded={open === g.id} aria-haspopup="true" onClick={() => setOpen(open === g.id ? null : g.id)} className={`${linkCls} gap-1`}>
                {g.label}<ChevronDown className={`h-3.5 w-3.5 text-white/60 transition-transform ${open === g.id ? "rotate-180" : ""}`} />
              </button>
              {open === g.id && (
                <div className={`absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 ${g.wide ? "w-[560px]" : "w-64"}`}>
                  <ul className={`grid gap-0.5 rounded-xl border border-white/10 bg-surface p-2 shadow-2xl ${g.wide ? "grid-cols-2" : ""}`}>
                    {g.links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="block rounded-lg px-3 py-2.5 hover:bg-white/[0.06]">
                          <span className="block text-[13.5px] font-semibold text-white">{l.label}</span>
                          {l.description && <span className="mt-0.5 block text-[12px] leading-snug text-white/50">{l.description}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          <Link href="/pricing" className={linkCls}>Pricing</Link>
        </nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <ThemeToggle />
          <Link href="/login" className="inline-flex items-center rounded-lg border border-white/15 bg-white/[0.06] px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-white/10">Log in</Link>
          <Link href="/signup" className="btn-accent inline-flex items-center rounded-lg bg-brand px-5 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover">Start free trial</Link>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <button type="button" onClick={() => setMobile((m) => !m)} aria-expanded={mobile} aria-label={mobile ? "Close menu" : "Open menu"} className="inline-flex items-center justify-center rounded-lg p-2 text-white hover:bg-white/10">
            {mobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobile && (
        <div className="mx-auto mt-2 max-h-[calc(100vh-6rem)] max-w-[1180px] overflow-y-auto rounded-xl border border-white/10 bg-surface p-4 shadow-2xl lg:hidden">
          {groups.map((g) => (
            <details key={g.id} className="group border-b border-white/10 py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-3 text-[15px] font-semibold text-white [&::-webkit-details-marker]:hidden">{g.label}<ChevronDown size={16} className="text-white/50 transition-transform group-open:rotate-180" /></summary>
              <ul className="pb-2">{g.links.map((l) => <li key={l.href}><Link href={l.href} className="block rounded-lg px-3 py-2 text-[14px] text-white/70 hover:bg-white/[0.06] hover:text-white">{l.label}</Link></li>)}</ul>
            </details>
          ))}
          <Link href="/pricing" className="block border-b border-white/10 px-2 py-4 text-[15px] font-semibold text-white">Pricing</Link>
          <div className="mt-4 flex gap-3">
            <Link href="/login" className="flex-1 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-center text-[14px] font-medium text-white">Log in</Link>
            <Link href="/signup" className="btn-accent flex-1 rounded-xl bg-brand px-4 py-2.5 text-center text-[14px] font-semibold text-white">Start free trial</Link>
          </div>
        </div>
      )}
    </header>
  );
}
