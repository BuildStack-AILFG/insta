import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { MARKETING as M } from "@/lib/marketing/designTokens";

const LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Documentation", href: "/docs" },
  { label: "Help Center", href: "/help" },
  { label: "Blog", href: "/blog" },
  { label: "Contact us", href: "/contact" },
];

export default function NotFoundView() {
  return (
    <section className="px-6 pb-24 pt-40 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand"><Compass size={28} /></span>
      <p className={`${M.overline} mt-6`}>Error 404</p>
      <h1 className={`${M.h1} mx-auto mt-3 max-w-2xl`}>We couldn&apos;t find that page</h1>
      <p className={`${M.bodyLarge} mx-auto mt-4 max-w-xl`}>The link may be old or mistyped. Try one of these instead.</p>
      <div className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-2.5">
        {LINKS.map((l) => <Link key={l.href} href={l.href} className="rounded-full border border-white/15 px-4 py-2 text-[14px] text-white/80 transition hover:border-brand hover:text-white">{l.label}</Link>)}
      </div>
      <Link href="/" className={`${M.btnPrimary} mt-10`}>Back to home <ArrowRight size={16} /></Link>
    </section>
  );
}
