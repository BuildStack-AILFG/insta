"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MARKETING } from "@/lib/marketing/designTokens";
import { AiMock, AnalyticsMock, CommentToDmMock, FlowMock, InboxMock, StoryMock } from "@/components/landing/mocks";

const SUB_NAV = [
  { label: "Features", href: "#features" },
  { label: "AI Suite", href: "#ai-suite" },
  { label: "Why us?", href: "#why-us" },
  { label: "Industries", href: "#industries" },
  { label: "Integrations", href: "#integrations" },
  { label: "Success Stories", href: "#success-stories" },
];

const CAPABILITIES = [
  { tag: "Comment → DM", title: "Turn Every Comment into a Conversation", description: "Reply under the comment and DM everyone who comments your keyword — with link buttons, in under a second.", href: "/features/comment-to-dm", Mock: CommentToDmMock },
  { tag: "AI Agent", title: "Answer DMs with AI, 24×7", description: "An AI agent trained on your FAQs and website answers questions, qualifies leads and hands tricky chats to your team.", href: "/features/ai-agent", Mock: AiMock },
  { tag: "Flows", title: "Build DM Funnels Without Code", description: "Ask questions, branch on quick replies, tag people and create deals with a drag-and-drop flow builder.", href: "/features/flow-builder", Mock: FlowMock },
  { tag: "Inbox", title: "One Inbox for Your Whole Team", description: "DMs, story replies and mentions in a shared inbox with assignment, notes and bot-to-human handover.", href: "/features/team-inbox", Mock: InboxMock },
  { tag: "Stories", title: "Reward Story Replies & Mentions", description: "Thank people who reply to or mention you in a story, tag them and send an offer automatically.", href: "/features/story-automation", Mock: StoryMock },
  { tag: "Analytics", title: "See What Your Content Earns", description: "Comments received, DMs sent, reply times and team performance — per post and per automation.", href: "/features/analytics", Mock: AnalyticsMock },
];

export default function CapabilitiesGridSection() {
  return (
    <section id="features" className={MARKETING.section}>
      <div className={MARKETING.container}>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 border-b border-white/10 pb-6">
          {SUB_NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="rounded-full px-4 py-1.5 text-[13px] font-semibold text-white/60 transition-colors hover:bg-brand/15 hover:text-brand-soft"
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-2xl text-center">
          <p className={MARKETING.overline}>Power-Packed Suite</p>
          <h2 className={`${MARKETING.h2} mt-3`}>Powerful Capabilities That Maximize Your Reach</h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ tag, title, description, href, Mock }) => (
            <Link
              key={title}
              href={href}
              className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white/[0.06]"
            >
              <div className="p-6 pb-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--brand-bright)" }}>
                  {tag}
                </p>
                <h3 className="mt-2 text-[16px] font-bold leading-snug text-white">{title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/70">{description}</p>
                <span
                  className="mt-3 inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold underline underline-offset-2"
                  style={{ color: "var(--brand-bright)" }}
                >
                  Learn More
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
              <div className="mt-4 h-48 w-full px-5 pb-5">
                <Mock />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
