"use client";

import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { MARKETING } from "@/lib/marketing/designTokens";
import { AiMock, CommentToDmMock, FlowMock, IntentMock, LeadMock } from "@/components/landing/mocks";

const AI_POINTS = [
  { label: "An AI Agent That Answers DMs from Your Knowledge Base", Mock: AiMock },
  { label: "Go Beyond Keywords with Intent Matching", Mock: IntentMock },
  { label: "Capture Emails & Phone Numbers Right in the DM", Mock: LeadMock },
  { label: "Comment → DM Funnels That Run Themselves", Mock: CommentToDmMock },
  { label: "No-Code Flows for Every Question", Mock: FlowMock },
];

export default function AICapabilitiesSection({
  onGetStarted,
  onBookDemo,
}: {
  onGetStarted?: () => void;
  onBookDemo?: () => void;
}) {
  const [active, setActive] = useState(0);

  return (
    <section id="ai-suite" className={`${MARKETING.section} bg-black`}>
      <div className={MARKETING.container}>
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 lg:order-1">
            <p className={MARKETING.overline}>AI Suite</p>
            <h2 className={`${MARKETING.h2} mt-3`}>Put Your Instagram DMs on Autopilot with AI</h2>

            <ul className="mt-6 space-y-4">
              {AI_POINTS.map((point, i) => (
                <li key={point.label}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => setActive(i)}
                    className={`flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      active === i ? "bg-brand/15" : "hover:bg-brand/10"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        active === i ? "bg-brand text-white" : "bg-brand/20 text-brand"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="text-[15px] font-semibold text-white">{point.label}</span>
                  </button>
                </li>
              ))}
            </ul>

            <p className={`${MARKETING.body} mt-6`}>A simple, transparent and powerful platform — built only for Instagram, on Meta’s official API.</p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={onGetStarted} className={MARKETING.btnPrimary}>
                Start Free Trial
              </button>
              <button type="button" onClick={onBookDemo} className={`group ${MARKETING.btnOutline}`}>
                Book a Demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative mx-auto max-w-md">
              <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-pink-500/20 via-fuchsia-500/10 to-orange-400/15 blur-2xl" />
              <div className="h-72">{(() => { const M = AI_POINTS[active].Mock; return <M />; })()}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
