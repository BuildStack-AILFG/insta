"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MARKETING } from "@/lib/marketing/designTokens";

const INDUSTRIES = [
  { title: "Beauty & Cosmetics", description: "DM product links to everyone who comments on a tutorial reel, and answer shade questions with AI.", image: "/images/industries/beauty-cosmetics.webp" },
  { title: "E-commerce & D2C", description: "Turn “price?” and “link?” comments into DMs with a Shop button, and capture emails for launches.", image: "/images/industries/ecommerce.webp" },
  { title: "Creators & Influencers", description: "Deliver freebies, guides and affiliate links to every commenter — and never miss a brand DM.", image: "/images/industries/marketing-agencies.webp" },
  { title: "Education & Coaching", description: "Send the free webinar link to everyone who comments, then qualify students with a DM flow.", image: "/images/industries/education.webp" },
  { title: "Spas & Salons", description: "Answer “available tomorrow?” instantly and share your booking link from comments and story replies.", image: "/images/industries/spas-salons.webp" },
  { title: "Restaurants & Cafés", description: "Share the menu and table-booking link with everyone who comments or mentions you in a story.", image: "/images/industries/restaurant-food.webp" },
  { title: "Health & Wellness", description: "Send programme details and capture phone numbers from people who comment on your transformation posts.", image: "/images/industries/health-wellness.webp" },
  { title: "Travel & Tourism", description: "DM itineraries and prices to every commenter on a destination reel, 24×7.", image: "/images/industries/travel-tourism.webp" },
  { title: "Real Estate", description: "Send brochures and site-visit links to people who comment on property walkthroughs.", image: "/images/industries/real-estate.webp" },
  { title: "Home Decor & Furnishing", description: "Reply to “where is this from?” with product links, straight from the comments.", image: "/images/industries/home-decor.webp" },
  { title: "Marketing Agencies", description: "Run comment automations for every client account from one workspace.", image: "/images/industries/marketing-agencies.webp" },
  { title: "Freelancers & Consultants", description: "Send your portfolio or booking link to everyone who comments “info” on your posts.", image: "/images/industries/freelancer-consultants.webp" },
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
          {INDUSTRIES.map(({ title, description, image }) => (
            <Link
              key={title}
              href="#contact"
              className={`group ${MARKETING.card} ${MARKETING.cardHover} overflow-hidden flex flex-col`}
            >
              <div className="w-full overflow-hidden bg-black" style={{ aspectRatio: "1024 / 507" }}>
                <img src={image} alt={title} className="h-full w-full object-cover" loading="lazy" />
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
