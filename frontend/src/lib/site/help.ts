import type { Faq } from "./seo";

export type HelpCategory = { id: string; title: string; blurb: string; faqs: Faq[] };

export const HELP: HelpCategory[] = [
  {
    id: "account",
    title: "Account & getting started",
    blurb: "Sign-up, workspaces, trials and your team.",
    faqs: [
      { q: "How do I create an account?", a: "Go to the sign-up page and enter your name, work email, company name and a password. Your workspace and a free trial are created immediately." },
      { q: "How long is the free trial?", a: "New workspaces start with a free trial with limits that are enough to try every feature. The trial end date is shown in Settings → Plan & billing." },
      { q: "What happens when my trial ends?", a: "Your workspace moves to the free plan with lower limits. Your data is kept, and you can choose a paid plan at any time to restore higher limits." },
      { q: "How do I invite a teammate?", a: "Open Settings → Team, enter their email and choose a role. They receive an invitation link (or you can copy the link yourself if email isn't configured)." },
      { q: "I forgot my password.", a: "Use 'Forgot password' on the login page. We email a reset link that works once and expires shortly after." },
    ],
  },
  {
    id: "instagram",
    title: "Instagram account & messaging",
    blurb: "Connecting your account, the 24-hour window and message delivery.",
    faqs: [
      { q: "Which Instagram accounts can I connect?", a: "Professional accounts — Business or Creator. Personal accounts have no API access; switch in the Instagram app under Settings → Account type and tools." },
      { q: "Do I have to share my Instagram password?", a: "No. You log in with Instagram and approve access to comments and messages. GramForGrow never sees your password, and you can revoke access any time." },
      { q: "Why can't I reply to someone?", a: "Instagram only lets businesses reply within 24 hours of the person's last message (up to 7 days for human agents if your Meta app has that permission). You can reply again as soon as they message you." },
      { q: "Can I message people who never contacted me?", a: "No. Instagram doesn't allow businesses to message people first. Conversations start when someone comments, DMs you, replies to your story or mentions you." },
      { q: "Why did a message fail?", a: "Open the message in the inbox to see the reason Instagram gave — for example the reply window closed, the person restricted your account, or access needs to be renewed." },
      { q: "Why aren't comments or DMs arriving?", a: "Open the Instagram page and check the account shows “Receiving comments & DMs”. If not, click Refresh; if access expired, reconnect the account." },
    ],
  },
  {
    id: "comment-automations",
    title: "Comment automations",
    blurb: "Keywords, public replies and DMs from comments.",
    faqs: [
      { q: "Why didn't a comment get a reply?", a: "Open Comment → DM → Activity. Each comment shows what happened: no keyword match, already replied to that person, or an error from Instagram." },
      { q: "How many DMs can one comment get?", a: "Instagram allows one private reply per comment, within 7 days of it. Once the person replies to your DM, the conversation is open and flows, keyword replies and the AI agent can continue." },
      { q: "Can I run an automation on my next post before I publish it?", a: "Yes. Choose “My next post” and it attaches itself to the first post or reel you publish afterwards." },
      { q: "Will people get the DM more than once?", a: "Not by default. “Only reply once per person” is on for new automations, so repeat comments are logged as skipped." },
    ],
  },
  {
    id: "automation",
    title: "Flows, replies & AI",
    blurb: "Automating conversations safely.",
    faqs: [
      { q: "Why isn't my flow running?", a: "Check that it's published (not a draft), that its trigger matches the message, and that the contact isn't inside a cooldown for that flow." },
      { q: "Why did automation stop in a conversation?", a: "When a person replies from the inbox, automation for that conversation pauses so the customer isn't answered twice. Resume it from the conversation." },
      { q: "How do I improve AI answers?", a: "Add or edit knowledge sources: FAQs, text and web pages. Review conversations, note the questions it couldn't answer and add them to the knowledge base." },
      { q: "Does the AI use my data to train models?", a: "The AI feature sends the conversation context needed to answer to Anthropic's API. See the privacy policy for what is shared and how it's handled." },
    ],
  },
  {
    id: "billing",
    title: "Plans, payments & invoices",
    blurb: "Paying for GramForGrow and collecting payments from customers.",
    faqs: [
      { q: "How do I upgrade?", a: "Open Settings → Plan & billing, choose a plan and billing period, add your business details and pay online with UPI, card or netbanking through Razorpay." },
      { q: "Is GST included in the price?", a: "Prices are shown before GST. 18% GST is added at checkout, and your invoice shows the breakup — CGST and SGST for in-state customers, IGST otherwise." },
      { q: "Can I get a GST invoice with my GSTIN?", a: "Yes. Add your business name, address and GSTIN under Billing details before paying, and it appears on the invoice." },
      { q: "Does my plan renew automatically?", a: "No. Plans are prepaid for the period you choose and don't auto-debit. We email you before the plan ends so you can renew." },
      { q: "What if I change plan mid-period?", a: "The unused time on your current plan is credited toward the new one, and the credit is shown before you pay." },
      { q: "How do I collect payments from my own customers?", a: "Connect your own Razorpay account in Settings → Payments, then send payment links from chats or deals. Money settles directly into your Razorpay account." },
    ],
  },
  {
    id: "privacy",
    title: "Privacy & security",
    blurb: "Where data lives and who can access it.",
    faqs: [
      { q: "Who can see my conversations?", a: "Members of your workspace according to their role. Access by GramForGrow staff is restricted and used only to run the service or to help with a support request you make." },
      { q: "How do I delete my data?", a: "Contact us from the email on your account and we'll delete your workspace and the data in it, subject to legal retention requirements such as tax invoices." },
      { q: "How do you protect credentials?", a: "Instagram access tokens, AI keys and payment keys are encrypted at rest. Passwords are hashed and never stored in plain text." },
    ],
  },
];

export const allHelpFaqs = () => HELP.flatMap((c) => c.faqs.map((f) => ({ ...f, category: c.title })));
