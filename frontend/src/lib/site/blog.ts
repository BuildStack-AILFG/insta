import type { Block } from "./seo";

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  category: "Guides" | "Playbooks" | "Marketing" | "Sales" | "Payments" | "AI";
  published: string; // ISO date
  modified?: string;
  readMinutes: number;
  keywords: string[];
  /** Feature / solution pages this post should send readers to. */
  cta: { label: string; href: string };
  body: Block[];
};

export const POSTS: Post[] = [
  {
    slug: "instagram-comment-to-dm-guide",
    title: "Comment-to-DM on Instagram: the complete guide to “comment LINK and I'll send it”",
    excerpt: "Why comment-gated DMs work so well, how they stay inside Instagram's rules, and how to set one up that people actually respond to.",
    category: "Guides",
    published: "2026-09-26",
    readMinutes: 7,
    keywords: ["Instagram comment to DM", "comment LINK Instagram", "Instagram auto DM comments", "ManyChat comment automation"],
    cta: { label: "See Comment → DM", href: "/features/comment-to-dm" },
    body: [
      { type: "p", text: "You've seen it on every creator's reel: *“Comment GUIDE and I'll DM it to you.”* It works because it turns a passive viewer into a conversation — and a conversation is where sales happen. Here's how it works under the hood and how to run one well." },
      { type: "h2", text: "Why it works" },
      { type: "ul", items: ["**Comments boost reach.** A post that collects hundreds of comments gets shown to more people.", "**The DM starts a relationship.** Once someone replies to your DM, you can keep talking — Instagram opens a 24-hour window each time they message.", "**It's instant gratification.** The person asked for something and got it in seconds, while they're still on your post."] },
      { type: "h2", text: "How it stays within Instagram's rules" },
      { type: "p", text: "Instagram's API has a feature called **private replies**: a business can send one DM in response to a comment, within 7 days of it. Tools that use the official API — like GramForGrow — send exactly that one message. Tools that log in with your password and click around pretend to be you, and that's what gets accounts restricted." },
      { type: "callout", tone: "info", title: "One DM per comment", text: "You get one private reply per comment. Make it count: say what you promised, add a button, and ask a question so they reply — which opens the conversation." },
      { type: "h2", text: "Set one up in five steps" },
      { type: "ol", items: ["Pick the post or reel (or arm it for your **next post** before you publish).", "Choose one clear keyword — LINK, GUIDE, PRICE — and say it in the caption and on screen.", "Write two or three public replies (“Sent you a DM @name! 💌”) so the comment section doesn't look robotic.", "Write the DM: deliver the promise, add a link button, and end with a question.", "Turn on **only once per person** so repeat comments don't trigger repeat DMs."] },
      { type: "h2", text: "What to put in the DM" },
      { type: "table", head: ["Goal", "DM that works"], rows: [["Sell a product", "“Here's the link 👇 [Shop now] Want the combo price too?”"], ["Grow an email list", "“Drop your email and I'll send the guide 📩”"], ["Book calls", "“Here's my calendar 👇 [Book a slot] What are you hoping to fix?”"]] },
      { type: "h2", text: "Measure it" },
      { type: "p", text: "Watch three numbers per post: comments, DMs sent and replies to your DM. If comments are high but replies are low, your DM needs a better question at the end." },
    ],
  },
  {
    slug: "instagram-messaging-window-explained",
    title: "Instagram's 24-hour messaging window, private replies and the 7-day human agent tag — explained",
    excerpt: "When a business can and can't message someone on Instagram, in plain English — and how to design automation around it.",
    category: "Guides",
    published: "2026-09-26",
    readMinutes: 5,
    keywords: ["Instagram 24 hour window", "Instagram private replies", "Instagram human agent tag", "Instagram messaging rules for business"],
    cta: { label: "See the team inbox", href: "/features/team-inbox" },
    body: [
      { type: "p", text: "Instagram protects people from spam with a few simple rules for business messaging. Knowing them saves you from “why didn't my message send?” moments." },
      { type: "h2", text: "Rule 1: they have to go first" },
      { type: "p", text: "A business can't cold-DM people through the API. The conversation starts when someone **messages you, comments on your post, replies to your story or mentions you**." },
      { type: "h2", text: "Rule 2: the 24-hour window" },
      { type: "p", text: "Every time someone messages you, you get 24 hours to reply as much as you like — text, links, buttons, images. When the window closes, you wait for them to message again." },
      { type: "h2", text: "Rule 3: one private reply per comment" },
      { type: "p", text: "A comment isn't a message, so it doesn't open the 24-hour window. Instead you may send **one** private reply DM per comment, within 7 days. If they reply to it, the normal 24-hour window starts." },
      { type: "h2", text: "Rule 4: human agents get 7 days" },
      { type: "p", text: "Apps approved for the **Human Agent** permission may let a real person (not automation) reply for up to 7 days after the last message — useful for support cases that take time." },
      { type: "table", head: ["Situation", "Can you message?"], rows: [["They DMed you 3 hours ago", "Yes — anything"], ["They commented yesterday", "Yes — one private reply"], ["They DMed you 3 days ago", "Only a human agent, if your app has the permission"], ["They've never interacted", "No"]] },
      { type: "callout", tone: "tip", title: "Design tip", text: "End every automated message with a question. When they answer, the window resets and your flow can continue." },
    ],
  },
  {
    slug: "instagram-comment-keywords-that-convert",
    title: "12 comment keywords that turn Instagram viewers into leads",
    excerpt: "The keyword you ask for shapes who comments and what they expect. Here are the ones that work for shops, creators, coaches and services.",
    category: "Marketing",
    published: "2026-09-26",
    readMinutes: 4,
    keywords: ["Instagram comment keywords", "comment to get link ideas", "Instagram CTA ideas", "Instagram lead magnet"],
    cta: { label: "Create a comment automation", href: "/features/comment-to-dm" },
    body: [
      { type: "p", text: "A good keyword is short, easy to spell on a phone, and tells people exactly what they'll get." },
      { type: "h2", text: "For shops and D2C brands" },
      { type: "ul", items: ["**LINK** — the product page", "**PRICE** — the price list or combo offer", "**SIZE** — a size guide and the right product link", "**DROP** — early access to your next launch"] },
      { type: "h2", text: "For creators" },
      { type: "ul", items: ["**GUIDE** — a free PDF or checklist", "**PRESETS** — a download for your photography audience", "**RECIPE** — the full recipe from your reel"] },
      { type: "h2", text: "For coaches and services" },
      { type: "ul", items: ["**WEBINAR** — the registration link", "**CALL** — your booking calendar", "**PLAN** — a sample plan in exchange for an email", "**DETAILS** — brochure and pricing for property, travel or courses", "**MENU** — for restaurants and cafés"] },
      { type: "callout", tone: "info", text: "Use one keyword per post, say it in the caption and on screen, and add a couple of similar words (LINK, LINKS) so typos still match." },
    ],
  },
  {
    slug: "capture-leads-in-instagram-dms",
    title: "How to capture emails and phone numbers in Instagram DMs (without a form)",
    excerpt: "A short DM flow collects better leads than a link-in-bio form. Here's the flow, the wording and where to send the data.",
    category: "Sales",
    published: "2026-09-26",
    readMinutes: 5,
    keywords: ["Instagram lead generation", "collect emails Instagram", "Instagram DM lead capture", "Instagram to Google Sheets"],
    cta: { label: "See lead capture", href: "/features/lead-capture" },
    body: [
      { type: "p", text: "Every extra click loses people. Asking for an email right in the DM — where they already are — converts far better than sending them to a form." },
      { type: "h2", text: "The flow" },
      { type: "ol", items: ["Trigger: someone comments your keyword (or DMs it).", "DM: “Want the guide? Drop your email and I'll send it 📩”", "Ask a question step with **email validation** — wrong emails get a friendly retry.", "Deliver the resource with a link button.", "Tag them **lead** and send the email to Google Sheets or your CRM with a webhook."] },
      { type: "h2", text: "Wording that works" },
      { type: "ul", items: ["Say what they get and when: “I'll send it right away”", "Ask for one thing at a time", "Confirm: “Sent! Check your inbox ✨” — it builds trust for the next ask"] },
      { type: "callout", tone: "tip", text: "Ask for a phone number only when you'll actually call — for property, education or high-ticket services." },
    ],
  },
  {
    slug: "automate-instagram-story-replies",
    title: "Automating Instagram story replies and mentions: thank, tag and reward",
    excerpt: "Story mentions are free advertising. A quick, warm automated response turns them into repeat customers and more mentions.",
    category: "Playbooks",
    published: "2026-09-26",
    readMinutes: 4,
    keywords: ["Instagram story mention automation", "story reply auto DM", "Instagram UGC reward", "story mention thank you"],
    cta: { label: "See story automation", href: "/features/story-automation" },
    body: [
      { type: "p", text: "When a customer tags you in their story, their followers see your brand. Most businesses never reply. A thank-you within seconds — with a small reward — makes people want to do it again." },
      { type: "h2", text: "The playbook" },
      { type: "ol", items: ["Create a flow with the **Story reply or mention** trigger.", "Send a warm thank-you that uses their name.", "Add a reward: a discount code, early access or a freebie.", "Tag them **story-fan** so you can find your best promoters later.", "Set a cooldown so daily mentioners don't get the same message every day."] },
      { type: "callout", tone: "info", text: "Story replies to *your* stories arrive the same way — use them to answer poll votes or questions with a link." },
    ],
  },
  {
    slug: "ai-agent-vs-rule-based-flows",
    title: "AI agent or rule-based flows for Instagram DMs? Use both — here's how",
    excerpt: "Flows are predictable, AI is flexible. The best DM setups use flows for the paths you know and AI for everything else.",
    category: "AI",
    published: "2026-09-26",
    readMinutes: 5,
    keywords: ["Instagram AI chatbot", "AI vs chatbot flows", "Instagram DM automation AI", "AI customer support Instagram"],
    cta: { label: "See the AI agent", href: "/features/ai-agent" },
    body: [
      { type: "p", text: "Rule-based flows do exactly what you tell them. An AI agent understands questions you didn't anticipate. Each has a job." },
      { type: "table", head: ["Use", "Best tool"], rows: [["Deliver a promised link or freebie", "Comment automation / flow"], ["Collect an email or phone number", "Flow with validation"], ["Answer “is this good for oily skin?”", "AI agent from your knowledge base"], ["Qualify a lead with fixed questions", "Flow"], ["Handle unexpected questions at 2 am", "AI agent"]] },
      { type: "h2", text: "How they work together" },
      { type: "p", text: "In GramForGrow, a DM is checked in order: a waiting flow, keyword replies and flows, then the AI agent. The AI only answers what your rules don't — and hands the chat to your team when it isn't confident or someone asks for a person." },
      { type: "callout", tone: "warn", title: "Keep the AI grounded", text: "Only give it facts you're happy to see quoted — FAQs, policies and product pages — and review conversations weekly to fill gaps." },
    ],
  },
];

export const postBySlug = (slug: string) => POSTS.find((p) => p.slug === slug);

export const CATEGORIES: readonly string[] = Array.from(new Set(POSTS.map((p) => p.category)));
