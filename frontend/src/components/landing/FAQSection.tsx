"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Minus } from "lucide-react";

const FAQS = [
  {
    q: "Is GramForGrow safe for my Instagram account?",
    a: "Yes. We only use Meta's official Instagram API — you log in with Instagram and approve access, and we never ask for your password. Automations follow Instagram's rules, like replying within 24 hours of someone's last message.",
  },
  {
    q: "How does onboarding work?",
    a: "Most teams go live in under 15 minutes. Connect your Instagram Business or Creator account, pick a post, add a keyword and a DM — and your first comment automation is live. Guided onboarding is included on Growth and Enterprise.",
  },
  {
    q: "Can I upgrade or downgrade my plan anytime?",
    a: "Yes. Start on Starter and upgrade to Growth as your team scales. You can change plans anytime — billing adjusts on your next cycle.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. Comment automations, keyword replies and DM flows are all built with a point-and-click, no-code builder.",
  },
  {
    q: "How does AI automation work?",
    a: "The AI agent answers DMs from your FAQs and website, qualifies leads, and hands a conversation to your team whenever it isn't sure — or when someone asks for a human.",
  },
  {
    q: "Is my data secure?",
    a: "All data is encrypted in transit and at rest. We use tenant isolation, role-based access, and follow enterprise security best practices.",
  },
];

export default function FAQSection({ onBookDemo }: { onBookDemo?: () => void }) {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="relative overflow-hidden bg-black py-14 sm:py-16 lg:py-20">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black via-alt to-black" />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">FAQ</p>
          <h2
            className="mt-3 text-[1.75rem] font-extrabold leading-[1.12] tracking-[-0.03em] text-white sm:text-[2.15rem]"
            style={{ fontFamily: "var(--font-plus-jakarta)" }}
          >
            Questions before you start
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-white/60">
            Common questions about GramForGrow, onboarding, pricing, and security.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div key={faq.q} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-white/5"
                >
                  <span className="pr-4 text-[15px] font-semibold text-white">{faq.q}</span>
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      isOpen ? "bg-brand text-white" : "bg-brand/15 text-brand"
                    }`}
                  >
                    {isOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-white/10 px-5 pb-5 pt-4">
                    <p className="text-[15px] leading-relaxed text-white/60">{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[15px] text-white/60">
          Still have questions?{" "}
          {onBookDemo ? (
            <button type="button" onClick={onBookDemo} className="font-semibold text-brand transition-colors hover:text-brand-soft">
              Book a demo
            </button>
          ) : (
            <Link href="#contact" className="font-semibold text-brand transition-colors hover:text-brand-soft">
              Book a demo
            </Link>
          )}
        </p>
      </div>
    </section>
  );
}
