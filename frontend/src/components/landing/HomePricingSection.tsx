import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlanCards, TrustStrip } from "@/components/site/PricingTable";
import { getPublicPricing } from "@/lib/site/livePlans";

/** Home-page pricing: the same live plan cards as /pricing (Starter, Growth, Enterprise) under the hero copy. */
export default async function HomePricingSection() {
  const { plans, trial } = await getPublicPricing();
  return (
    <section id="pricing" className="relative bg-black py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">Pricing</p>
        <h2 className="mt-3 text-[1.75rem] font-extrabold leading-[1.12] tracking-[-0.03em] text-white sm:text-[2.35rem]" style={{ fontFamily: "var(--font-plus-jakarta)" }}>
          Start free. Pay only for volume.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-white/60">
          Every paid plan includes every feature — comment-to-DM, DM inbox, flows, AI agent, pipeline and payments. Pick the size that fits your team and upgrade any time.
        </p>
      </div>
      <div className="mx-auto mt-12 max-w-6xl px-4 sm:px-6 lg:px-8">
        <PlanCards plans={plans} />
        <TrustStrip trialDays={trial.days} />
        <p className="mt-8 text-center text-[13.5px] text-white/50">
          Want to compare every limit? <Link href="/pricing" className="inline-flex items-center gap-1 font-semibold text-brand-bright hover:underline">See the full comparison <ArrowRight size={13} /></Link>
        </p>
      </div>
    </section>
  );
}
