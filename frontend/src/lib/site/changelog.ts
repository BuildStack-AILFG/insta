export type ChangeEntry = {
  date: string; // ISO
  title: string;
  tag: "New" | "Improved" | "Platform";
  summary: string;
  items: string[];
};

/** Newest first. Add an entry whenever something customer-visible ships. */
export const CHANGELOG: ChangeEntry[] = [
  {
    date: "2026-09-27",
    title: "DM links, QR codes, link in bio, Live comments and an AI copywriter",
    tag: "New",
    summary: "More ways to bring people into your DMs — and help writing what you send them.",
    items: [
      "ig.me DM links with QR codes: opening one sends a welcome, tags the person and can start a flow",
      "Link-in-bio page with a “DM us” button, and views and clicks counted",
      "Comment automations for Instagram Live",
      "Click reminders for people who didn't open your link (inside Instagram's 24-hour window)",
      "Write DMs, public replies and captions with AI",
    ],
  },
  {
    date: "2026-09-26",
    title: "Post scheduler and Instagram insights",
    tag: "New",
    summary: "Plan and auto-publish your content, and see how it performs.",
    items: [
      "Schedule or publish photos, carousels, reels and stories, with a first comment",
      "Video processing status, clear errors and the 24-hour publishing limit in the composer",
      "Insights: views, reach, interactions, follower growth, audience by country / city / age / gender, and per-post performance",
    ],
  },
  {
    date: "2026-09-26",
    title: "Moderation, giveaways and A/B testing",
    tag: "New",
    summary: "Keep your comments clean, run fair giveaways and find the DM that converts best.",
    items: [
      "Comment moderation: hide or delete spam, links, mass-tagging and (optionally) AI-detected abuse before automations reply",
      "Hide, unhide or delete any comment from the activity log",
      "Giveaways: random winners from a post's comments with entry rules, then DM the winners",
      "A/B test the DM of a comment automation and compare click rates",
      "A template gallery in the flow builder",
    ],
  },
  {
    date: "2026-09-26",
    title: "Unlock gates, click tracking and story auto-replies",
    tag: "New",
    summary: "Grow your followers and your list from comment automations, and see who actually clicks.",
    items: [
      "Follow to unlock: the link is only sent once the commenter follows your account",
      "Email or phone to unlock: collect a validated lead before sending the link",
      "Click tracking for DM link buttons — clicks per automation, and a clicked tag on each person",
      "Story mention and story reply auto-replies with an optional link button and tag",
      "Automation templates, lead-capture flow presets, and top posts in analytics",
    ],
  },
  {
    date: "2026-09-26",
    title: "GramForGrow for Instagram",
    tag: "New",
    summary: "Comment-to-DM automation, a shared DM inbox and DM flows for Instagram Business and Creator accounts, on Meta's official Instagram API.",
    items: [
      "Connect Instagram with Instagram login — no password sharing — with automatic access renewal",
      "Comment → DM: keyword matching, public reply variations, DMs with link buttons, once-per-person and “next post” automations",
      "Activity log showing what happened to every comment",
      "Shared DM inbox with story replies, mentions, reactions and messages sent from the Instagram app",
      "Ice breakers, keyword replies, welcome and away messages",
      "DM flow builder with quick replies, link buttons, questions, conditions, delays and a story-reply trigger",
      "AI agent trained on your knowledge base, sales pipeline, Razorpay payment links, REST API and signed webhooks",
    ],
  },
];
