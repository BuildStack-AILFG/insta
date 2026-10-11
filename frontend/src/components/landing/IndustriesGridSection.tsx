"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MARKETING } from "@/lib/marketing/designTokens";

const INDUSTRIES: { title: string; description: string; image: string; icon?: string }[] = [
  { title: "Beauty & Cosmetics", icon: "/images/site/3d/mirror.webp", description: "DM product links to everyone who comments on a tutorial reel, and answer shade questions with AI.", image: "/images/site/industries/beauty-cosmetics.svg" },
  { title: "E-commerce & D2C", icon: "/images/site/3d/online-shopping.webp", description: "Turn “price?” and “link?” comments into DMs with a Shop button, and capture emails for launches.", image: "/images/site/industries/ecommerce.svg" },
  { title: "Creators & Influencers", icon: "/images/site/3d/agency-discussion.webp", description: "Deliver freebies, guides and affiliate links to every commenter — and never miss a brand DM.", image: "/images/site/industries/creators.svg" },
  { title: "Education & Coaching", icon: "/images/site/3d/graduated.webp", description: "Send the free webinar link to everyone who comments, then qualify students with a DM flow.", image: "/images/site/industries/education.svg" },
  { title: "Spas & Salons", icon: "/images/site/3d/hair-dryer.webp", description: "Answer “available tomorrow?” instantly and share your booking link from comments and story replies.", image: "/images/site/industries/spas-salons.svg" },
  { title: "Restaurants & Cafés", icon: "/images/site/3d/cheese-burger.webp", description: "Share the menu and table-booking link with everyone who comments or mentions you in a story.", image: "/images/site/industries/restaurant-food.svg" },
  { title: "Health & Wellness", icon: "/images/site/3d/medical-kit.webp", description: "Send programme details and capture phone numbers from people who comment on your transformation posts.", image: "/images/site/industries/health-wellness.svg" },
  { title: "Travel & Tourism", icon: "/images/site/3d/suitcase.webp", description: "DM itineraries and prices to every commenter on a destination reel, 24×7.", image: "/images/site/industries/travel-tourism.svg" },
  { title: "Real Estate", icon: "/images/site/3d/apartment.webp", description: "Send brochures and site-visit links to people who comment on property walkthroughs.", image: "/images/site/industries/real-estate.svg" },
  { title: "Home Decor & Furnishing", icon: "/images/site/3d/home.webp", description: "Reply to “where is this from?” with product links, straight from the comments.", image: "/images/site/industries/home-decor.svg" },
  { title: "Marketing Agencies", icon: "/images/site/3d/dashboard-growth.webp", description: "Run comment automations for every client account from one workspace.", image: "/images/site/industries/marketing-agencies.svg" },
  { title: "Freelancers & Consultants", icon: "/images/site/3d/working-desk.webp", description: "Send your portfolio or booking link to everyone who comments “info” on your posts.", image: "/images/site/industries/freelancer-consultants.svg" },
];

export default function IndustriesGridSection() {
  return (
    <section id="industries" className={`${MARKETING.section} bg-black`}>
      <div className={MARKETING.container}>
        <div className="mx-auto max-w-2xl text-center">
          <p className={MARKETING.overline}>Industries</p>
          <h2 className={`${MARKETING.h2} mt-3`}>Built for Any Industry</h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map(({ title, description, image, icon }) => (
            <Link
              key={title}
              href="#contact"
              className={`group ${MARKETING.card} ${MARKETING.cardHover} overflow-hidden flex flex-col`}
            >
              <div className="w-full overflow-hidden bg-black" style={{ aspectRatio: "800 / 396" }}>
                {icon ? (
                  <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_55%,rgba(236,72,153,0.24),transparent_62%)] p-6">
                    <img
                      src={icon}
                      alt={title}
                      className="h-full w-auto max-w-full object-contain drop-shadow-[0_14px_22px_rgba(0,0,0,0.4)] transition-transform duration-300 group-hover:-translate-y-1"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <img src={image} alt={title} className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="min-w-0 flex-1 p-5">
                <h3 className="text-[15px] font-bold text-white">{title}</h3>
                <p className="mt-1 text-[13px] leading-snug text-white/60">{description}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
                  Learn More
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
