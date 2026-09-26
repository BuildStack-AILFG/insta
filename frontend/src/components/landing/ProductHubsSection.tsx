import Link from "next/link";
import { ArrowRight, AtSign, Heart, MessageCircle, Send } from "lucide-react";
import { MARKETING } from "@/lib/marketing/designTokens";

/** Small hand-drawn product previews (no screenshots), so they stay crisp and on-theme in both colour modes. */
function CommentPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-6">
      <div className="flex items-start gap-2">
        <span className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-pink-500 to-orange-400" />
        <p className="rounded-xl bg-white/10 px-3 py-1.5 text-[12px] text-white"><b>priya.styles</b> PRICE please 😍</p>
      </div>
      <div className="ml-8 flex items-start gap-2">
        <span className="h-5 w-5 shrink-0 rounded-full bg-brand" />
        <p className="rounded-xl bg-brand/30 px-3 py-1.5 text-[12px] text-white">Sent you a DM @priya.styles! 💌</p>
      </div>
      <p className="ml-8 flex items-center gap-1 text-[10.5px] font-semibold text-brand-bright"><Send className="h-3 w-3" /> DM delivered with a Shop button</p>
    </div>
  );
}

function InboxPreview() {
  const rows = [["aman.fit", "Do you ship to Pune?", 2], ["neha.glows", "Replied to your story", 0], ["rahul.k", "Mentioned you in a story", 1]] as const;
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-6">
      {rows.map(([u, t, n]) => (
        <div key={u} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5">
          <span className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-fuchsia-500 to-pink-400" />
          <div className="min-w-0 flex-1"><p className="text-[11.5px] font-semibold text-white">{u}</p><p className="truncate text-[10.5px] text-white/55">{t}</p></div>
          {n > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9.5px] font-bold text-white">{n}</span>}
        </div>
      ))}
    </div>
  );
}

function StoryPreview() {
  return (
    <div className="flex h-full items-center justify-center gap-4 px-6">
      <div className="relative h-32 w-20 overflow-hidden rounded-xl bg-gradient-to-b from-pink-500 via-fuchsia-600 to-orange-400 shadow-lg">
        <span className="absolute left-2 top-2 flex items-center gap-1 text-[9px] font-semibold text-white"><AtSign className="h-2.5 w-2.5" />you</span>
        <Heart className="absolute bottom-2 right-2 h-4 w-4 fill-white text-white" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="rounded-xl bg-white/10 px-2.5 py-1.5 text-[11px] text-white">🔥🔥 love this</p>
        <p className="self-end rounded-xl bg-brand/40 px-2.5 py-1.5 text-[11px] text-white">Thank you! Here&apos;s 10% off 💖</p>
      </div>
    </div>
  );
}

const HUBS = [
  {
    tag: "Comment → DM",
    title: "Turn Comments into Leads",
    description: "Someone comments a keyword on your post or reel — reply publicly and DM them the link, price list or offer in under a second.",
    href: "/features/comment-to-dm",
    Preview: CommentPreview,
  },
  {
    tag: "Inbox",
    title: "Never Miss a DM",
    description: "Every DM, story reply and mention in one shared team inbox — assign chats, add notes and hand over from bot to human.",
    href: "/features/team-inbox",
    Preview: InboxPreview,
  },
  {
    tag: "Stories",
    title: "Reward Every Story Reply",
    description: "Thank people who reply to or mention you in a story, tag them, and send a discount — automatically.",
    href: "/features/story-automation",
    Preview: StoryPreview,
  },
];

export default function ProductHubsSection() {
  return (
    <section id="hubs" className={MARKETING.section}>
      <div className={MARKETING.container}>
        <div className="mx-auto max-w-2xl text-center">
          <p className={MARKETING.overline}>Everything You Need</p>
          <h2 className={`${MARKETING.h2} mt-3`}>Everything You Need to Grow on Instagram</h2>
          <p className={`${MARKETING.body} mt-4`}>
            GramForGrow is an automation engine built only for Instagram — comments, DMs and stories, on Meta&apos;s official API. No risky bots, no password sharing.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {HUBS.map((hub) => (
            <div key={hub.tag} className={`${MARKETING.card} ${MARKETING.cardHover} flex flex-col overflow-hidden`}>
              <div className="theme-fixed h-44 w-full overflow-hidden bg-gradient-to-br from-[#1a0610] via-black to-[#2a0a1c]">
                <hub.Preview />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand"><MessageCircle className="h-3 w-3" />{hub.tag}</p>
                <h3 className={`${MARKETING.h3} mt-2`}>{hub.title}</h3>
                <p className={`${MARKETING.body} mt-2 flex-1`}>{hub.description}</p>
                <Link href={hub.href} className="group mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand hover:text-brand-soft">
                  Learn More
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
