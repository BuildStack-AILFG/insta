"use client";

import { useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";

function NavDropdownTrigger({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) {
  return (
    <button
      type="button"
      className="group inline-flex items-center gap-1 py-1 text-[14px] font-medium text-white hover:text-white transition-colors"
    >
      {children}
      <ChevronDown
        className={`h-3.5 w-3.5 text-white/70 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
      />
    </button>
  );
}

const productDropdown = [
  { label: "Comment → DM", href: "/features/comment-to-dm" },
  { label: "Team DM Inbox", href: "/features/team-inbox" },
  { label: "Story Automation", href: "/features/story-automation" },
  { label: "DM Flow Builder", href: "/features/flow-builder" },
  { label: "AI Agent", href: "/features/ai-agent" },
  { label: "Lead Capture", href: "/features/lead-capture" },
  { label: "Keyword Replies", href: "/features/keyword-replies" },
  { label: "Integrations & API", href: "/features/integrations-api" },
];

const solutionsDropdown = [
  { label: "E-commerce & D2C", href: "/solutions/ecommerce" },
  { label: "Creators", href: "/solutions/creators" },
  { label: "Beauty & Salons", href: "/solutions/beauty-salons" },
  { label: "Education", href: "/solutions/education" },
  { label: "Real Estate", href: "/solutions/real-estate" },
  { label: "Agencies", href: "/solutions/agencies" },
];

function DropdownMenu({ items, isOpen }: { items: { label: string; href: string }[]; isOpen: boolean }) {
  if (!isOpen) return null;
  return (
    <div className="absolute top-full left-0 pt-2 w-56 z-50">
      <div className="rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-[0_8px_30px_rgba(15,23,42,0.1)] py-1.5 overflow-hidden">
        {items.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="block px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function LandingNavbar() {
  const [openDropdown, setOpenDropdown] = useState<"product" | "solutions" | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a
      href={href}
      onClick={() => setIsMenuOpen(false)}
      className="inline-flex items-center py-1 text-[14px] font-medium text-white hover:text-white transition-colors"
    >
      {children}
    </a>
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 pt-5 sm:px-6">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 shadow-[0_4px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:px-5 lg:px-6">
        <a href="#top" className="shrink-0 ml-1">
          <span className="landing-logo text-[17px] sm:text-[18px]">GramForGrow</span>
        </a>

        <nav className="hidden lg:flex flex-1 items-center justify-center gap-7 xl:gap-9">
          <NavLink href="#top">Home</NavLink>
          <div
            className="relative"
            onMouseEnter={() => setOpenDropdown("product")}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <NavDropdownTrigger isOpen={openDropdown === "product"}>Product</NavDropdownTrigger>
            <DropdownMenu items={productDropdown} isOpen={openDropdown === "product"} />
          </div>
          <div
            className="relative"
            onMouseEnter={() => setOpenDropdown("solutions")}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <NavDropdownTrigger isOpen={openDropdown === "solutions"}>Solutions</NavDropdownTrigger>
            <DropdownMenu items={solutionsDropdown} isOpen={openDropdown === "solutions"} />
          </div>
          <NavLink href="/pricing">Pricing</NavLink>
          <NavLink href="#faq">FAQ</NavLink>
          <NavLink href="/contact">Contact</NavLink>
        </nav>

        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-white/[0.06] px-5 py-2 text-[14px] font-medium text-white border border-white/15 hover:bg-white/10 transition-colors"
          >
            Log in
          </a>
          <a
            href="/signup"
            className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2 text-[14px] font-semibold text-white hover:bg-brand-hover transition-colors"
          >
            Start free trial
          </a>
        </div>

        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="lg:hidden inline-flex items-center justify-center p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {isMenuOpen && (
        <div className="lg:hidden mx-auto mt-2 max-w-[1100px] rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-lg p-4">
          <div className="space-y-1">
            <a href="#top" className="block px-3 py-2 text-sm font-medium text-white rounded-lg hover:bg-white/10" onClick={() => setIsMenuOpen(false)}>
              Home
            </a>
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/40">Product</p>
            {productDropdown.map((item) => (
              <a key={item.label} href={item.href} className="block px-3 py-2 text-sm text-white/70 rounded-lg hover:bg-white/10" onClick={() => setIsMenuOpen(false)}>
                {item.label}
              </a>
            ))}
            <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/40">Solutions</p>
            {solutionsDropdown.map((item) => (
              <a key={item.label} href={item.href} className="block px-3 py-2 text-sm text-white/70 rounded-lg hover:bg-white/10" onClick={() => setIsMenuOpen(false)}>
                {item.label}
              </a>
            ))}
            <a href="/pricing" className="block px-3 py-2 text-sm font-medium text-white rounded-lg hover:bg-white/10" onClick={() => setIsMenuOpen(false)}>
              Pricing
            </a>
            <a href="#faq" className="block px-3 py-2 text-sm font-medium text-white rounded-lg hover:bg-white/10" onClick={() => setIsMenuOpen(false)}>
              FAQ
            </a>
            <a href="/contact" className="block px-3 py-2 text-sm font-medium text-white rounded-lg hover:bg-white/10" onClick={() => setIsMenuOpen(false)}>
              Contact
            </a>
            <div className="mt-3 flex gap-2 pt-3 border-t border-white/15">
              <a href="/login" className="flex-1 text-center rounded-xl bg-white/[0.06] border border-white/15 px-4 py-2.5 text-sm font-medium" onClick={() => setIsMenuOpen(false)}>
                Log in
              </a>
              <a href="/signup" className="flex-1 text-center rounded-xl bg-brand text-white px-4 py-2.5 text-sm font-semibold" onClick={() => setIsMenuOpen(false)}>
                Start trial
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
