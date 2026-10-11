import Link from "next/link";
import { ArrowRight, Quote } from "lucide-react";
import { MARKETING } from "@/lib/marketing/designTokens";

/**
 * Generic, unattributed industry personas illustrating common use cases —
 * not real named customers, so nothing here is a fabricated endorsement.
 */
const STORIES = [
  {
    quote: "Every “price?” under our reels now gets a DM with the link in seconds — even at 2 am.",
    role: "Owner, D2C Retail Brand",
    image: "/images/site/3d/avatar-sweater.webp",
  },
  {
    quote: "All our clients' DMs and story replies land in one inbox now — nothing falls through the cracks.",
    role: "Marketing Lead, Growing Agency",
    image: "/images/site/3d/avatar-tshirt.webp",
  },
  {
    quote: "People who comment on our menu reels get the booking link instantly, so the team can focus on guests.",
    role: "Manager, Restaurant Chain",
    image: "/images/site/3d/avatar-bucket-hat.webp",
  },
  {
    quote: "Comments on walkthrough reels turn into qualified leads — the DM flow asks budget and area for us.",
    role: "Broker, Real Estate Team",
    image: "/images/site/3d/avatar-brown-shirt.webp",
  },
];

export default function SuccessStoriesSection() {
  return (
    <section id="success-stories" className={MARKETING.section}>
      <div className={MARKETING.container}>
        <div className="mx-auto max-w-2xl text-center">
          <p className={MARKETING.overline}>Success Stories</p>
          <h2 className={`${MARKETING.h2} mt-3`}>Built for Businesses Like Yours</h2>
          <p className={`${MARKETING.body} mt-4`}>How teams across industries could use Instagram automation every day.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {STORIES.map((story) => (
            <div key={story.role} className={`${MARKETING.card} p-6 flex gap-4`}>
              <Quote className="h-6 w-6 shrink-0 text-brand/40" fill="currentColor" />
              <div className="min-w-0">
                <p className="text-[15px] leading-relaxed text-white">&ldquo;{story.quote}&rdquo;</p>
                <div className="mt-4 flex items-center gap-3">
                  <img src={story.image} alt="" aria-hidden="true" className="h-11 w-11 rounded-full bg-brand/20 object-cover object-top" loading="lazy" />
                  <p className="text-[13px] font-semibold text-white/60">{story.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="#contact" className="group inline-flex items-center gap-2 text-[14px] font-semibold text-brand hover:text-brand-soft">
            Share your own success story
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
