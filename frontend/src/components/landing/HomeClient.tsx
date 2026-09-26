"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SmoothScroll from "@/components/landing/SmoothScroll";
import LandingNavbar from "@/components/landing/LandingNavbar";
import PremiumHero from "@/components/landing/PremiumHero";
import ProductHubsSection from "@/components/landing/ProductHubsSection";
import AutomationInActionSection from "@/components/landing/AutomationInActionSection";
import CapabilitiesGridSection from "@/components/landing/CapabilitiesGridSection";
import AICapabilitiesSection from "@/components/landing/AICapabilitiesSection";
import StatsSection from "@/components/landing/StatsSection";
import IntegrationsTeaser from "@/components/landing/IntegrationsTeaser";
import IndustriesGridSection from "@/components/landing/IndustriesGridSection";
import SuccessStoriesSection from "@/components/landing/SuccessStoriesSection";
import LandingCTA from "@/components/landing/LandingCTA";
import FAQSection from "@/components/landing/FAQSection";
import ScrollToTopButton from "@/components/landing/ScrollToTopButton";
import BookDemoModal from "@/components/landing/BookDemoModal";
import Footer from "@/components/landing/Footer";

export default function HomeClient({ pricing }: { pricing?: React.ReactNode }) {
  const router = useRouter();
  const [demoOpen, setDemoOpen] = useState(false);

  const handleGetStarted = () => {
    router.push("/login");
  };

  const handleBookDemo = () => setDemoOpen(true);

  return (
    <SmoothScroll>
      <div id="top" className="min-h-screen overflow-x-hidden bg-black text-white">
        <LandingNavbar />
        <PremiumHero onGetStarted={handleGetStarted} onBookDemo={handleBookDemo} />
        <ProductHubsSection />
        <AutomationInActionSection />
        <CapabilitiesGridSection />
        <AICapabilitiesSection onGetStarted={handleGetStarted} onBookDemo={handleBookDemo} />
        <StatsSection />
        <IntegrationsTeaser />
        <IndustriesGridSection />
        <SuccessStoriesSection />
        {pricing}
        <FAQSection onBookDemo={handleBookDemo} />
        <LandingCTA onGetStarted={handleGetStarted} onBookDemo={handleBookDemo} />
        <Footer />
        <ScrollToTopButton />
        <BookDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      </div>
    </SmoothScroll>
  );
}
