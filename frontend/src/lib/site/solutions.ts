import { Building2, Camera, GraduationCap, Megaphone, Plane, ShoppingBag, Sparkles, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { Faq } from "./seo";

export type Solution = {
  slug: string;
  navLabel: string;
  icon: LucideIcon;
  tagline: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  h1: string;
  lead: string;
  challenges: { title: string; body: string }[];
  playbook: { title: string; body: string; feature: string }[];
  /** An illustrative conversation, shown as a chat mock-up. Not a customer story. */
  chat: { from: "customer" | "business"; text: string }[];
  chatCaption: string;
  features: string[];
  faqs: Faq[];
};

const SAFE_FAQ: Faq = {
  q: "Is automating DMs safe for my account?",
  a: "Yes. GramForGrow uses Meta's official Instagram API — you log in with Instagram and never share your password — and it follows Instagram's messaging rules.",
};

export const SOLUTIONS: Solution[] = [
  {
    slug: "ecommerce",
    navLabel: "E-commerce & D2C",
    icon: ShoppingBag,
    tagline: "Turn “price?” and “link?” comments into orders",
    metaTitle: "Instagram Automation for E-commerce & D2C Brands",
    metaDescription: "DM product links to everyone who comments on your reels, answer sizing and shipping questions 24×7, capture emails for launches and take payments in DMs.",
    keywords: ["Instagram automation for ecommerce", "Instagram DM product link", "D2C Instagram automation", "Instagram comment to DM Shopify"],
    h1: "Instagram automation for brands that sell from their reels",
    lead: "Your reels create demand; the comments are where it leaks away. Reply to every “price?” with a DM and a Shop button, answer product questions instantly and keep a list of fans for your next drop.",
    challenges: [
      { title: "Comments nobody answers", body: "Dozens of “price?” comments per reel, answered hours later — or never. Every one is a lost sale." },
      { title: "Repetitive DMs", body: "Sizing, shipping and COD questions eat your team's day." },
      { title: "No list to relaunch to", body: "Buyers disappear after the reel stops trending." },
    ],
    playbook: [
      { title: "Comment → DM on every product reel", body: "Keyword “PRICE” or “LINK” sends the product page with a Shop button.", feature: "comment-to-dm" },
      { title: "Answer product questions", body: "Keyword replies and the AI agent handle sizes, shipping and returns.", feature: "ai-agent" },
      { title: "Build a launch list", body: "Ask for an email in the DM before the next drop.", feature: "lead-capture" },
      { title: "Close in the chat", body: "Send a Razorpay payment link for DM orders.", feature: "payments" },
    ],
    chat: [
      { from: "customer", text: "💬 commented on your reel: “PRICE”" },
      { from: "business", text: "Hey Aditi! The vitamin C serum is ₹649 — here's the link 👇 [Shop now]" },
      { from: "customer", text: "Is it okay for oily skin?" },
      { from: "business", text: "Yes! It's lightweight and non-comedogenic. Want the combo with the toner at ₹999?" },
    ],
    chatCaption: "An illustrative comment-to-DM conversation.",
    features: ["comment-to-dm", "ai-agent", "lead-capture", "payments"],
    faqs: [
      { q: "Can it send a different link per product?", a: "Yes. Create one comment automation per post or reel, each with its own DM and buttons." },
      { q: "Does it connect to Shopify?", a: "Shopify and WooCommerce order events are recorded on the customer's contact and can start flows. DMs themselves go out in response to comments and messages." },
      SAFE_FAQ,
    ],
  },
  {
    slug: "creators",
    navLabel: "Creators & Influencers",
    icon: Camera,
    tagline: "Deliver freebies and links to every commenter, never miss a brand DM",
    metaTitle: "Instagram DM Automation for Creators & Influencers",
    metaDescription: "“Comment GUIDE and I'll DM it to you” — deliver freebies, affiliate links and presets automatically, grow your email list and keep brand-deal DMs organised.",
    keywords: ["Instagram automation for creators", "comment to get link", "Instagram freebie DM", "influencer DM automation"],
    h1: "Grow faster with “comment to get it” — without living in your DMs",
    lead: "Comment-gated freebies are the fastest way to grow engagement. GramForGrow delivers them to every commenter in seconds, while brand-deal DMs stay organised in one inbox.",
    challenges: [
      { title: "Hundreds of comments per post", body: "Manually DMing every “GUIDE” comment is impossible after a post takes off." },
      { title: "Brand DMs get buried", body: "Collaboration requests drown under fan messages." },
      { title: "Followers, not a list", body: "You don't own your audience until you have their email." },
    ],
    playbook: [
      { title: "Comment-gated freebies", body: "Keyword on the post → DM with the download link.", feature: "comment-to-dm" },
      { title: "Collect emails", body: "Ask for an email before sending the freebie.", feature: "lead-capture" },
      { title: "Label brand deals", body: "Route collaboration DMs to a label in the inbox.", feature: "team-inbox" },
      { title: "See what worked", body: "Compare comments and DMs across posts.", feature: "analytics" },
    ],
    chat: [
      { from: "customer", text: "💬 commented: “PRESETS”" },
      { from: "business", text: "Yay! Drop your email and I'll send the preset pack 📩" },
      { from: "customer", text: "maya@mail.com" },
      { from: "business", text: "Sent! Check your inbox ✨ [Download here]" },
    ],
    chatCaption: "An illustrative freebie-delivery conversation.",
    features: ["comment-to-dm", "lead-capture", "team-inbox", "analytics"],
    faqs: [
      { q: "Does it work on a Creator account?", a: "Yes — Business and Creator accounts both work. Personal accounts have no API access." },
      { q: "Will people get the DM more than once?", a: "No. By default each person gets one DM per automation, however many times they comment." },
      SAFE_FAQ,
    ],
  },
  {
    slug: "beauty-salons",
    navLabel: "Beauty, Spas & Salons",
    icon: Sparkles,
    tagline: "Answer “available tomorrow?” instantly and fill your calendar",
    metaTitle: "Instagram Automation for Salons, Spas & Beauty Brands",
    metaDescription: "Share prices and your booking link from comments and DMs, answer service questions 24×7 and reward story mentions from happy clients.",
    keywords: ["Instagram automation salon", "salon booking Instagram DM", "beauty brand Instagram automation", "spa Instagram DM"],
    h1: "Turn transformation reels into booked appointments",
    lead: "People comment and DM after every before/after reel. Send prices and your booking link instantly, answer questions after hours and thank clients who tag you.",
    challenges: [
      { title: "After-hours enquiries", body: "Most DMs arrive when the salon is busy or closed." },
      { title: "Same questions, every day", body: "Prices, timings and availability — typed again and again." },
      { title: "Unthanked mentions", body: "Clients tag you in stories and never hear back." },
    ],
    playbook: [
      { title: "Price list from comments", body: "“PRICE” on a reel sends the menu and booking link.", feature: "comment-to-dm" },
      { title: "Instant answers", body: "Keyword replies for timings, location and services.", feature: "keyword-replies" },
      { title: "Reward mentions", body: "Thank story mentions with a next-visit offer.", feature: "story-automation" },
      { title: "Book in a flow", body: "Ask service and preferred date, then hand to the front desk.", feature: "flow-builder" },
    ],
    chat: [
      { from: "customer", text: "Do you have a slot for balayage this Saturday?" },
      { from: "business", text: "Hi! Saturday has 11 am and 3 pm open. Which works for you?" },
      { from: "customer", text: "3 pm please" },
      { from: "business", text: "Great — tap here to confirm your slot 👇 [Book now]" },
    ],
    chatCaption: "An illustrative booking conversation.",
    features: ["comment-to-dm", "keyword-replies", "story-automation", "flow-builder"],
    faqs: [
      { q: "Can it connect to my booking software?", a: "Send your booking link in DMs, or use webhooks to pass booking requests to your system." },
      SAFE_FAQ,
    ],
  },
  {
    slug: "education",
    navLabel: "Education & Coaching",
    icon: GraduationCap,
    tagline: "Webinar links for every commenter, qualified students for your team",
    metaTitle: "Instagram Automation for Coaches, Courses & Institutes",
    metaDescription: "Send webinar and brochure links to everyone who comments, qualify students in a DM flow and hand serious enquiries to counsellors.",
    keywords: ["Instagram automation for coaches", "course enquiry Instagram DM", "edtech Instagram automation", "webinar link DM"],
    h1: "Fill your webinars and batches from Instagram comments",
    lead: "Every “WEBINAR” comment gets the link, every enquiry gets asked the right questions, and your counsellors only talk to students who are ready.",
    challenges: [
      { title: "Enquiries at all hours", body: "Students message late at night and move on if nobody replies." },
      { title: "Unqualified leads", body: "Counsellors spend time on people who aren't a fit." },
      { title: "No follow-up", body: "Interested students are forgotten after the first reply." },
    ],
    playbook: [
      { title: "Webinar link on comment", body: "Keyword on the reel sends the registration link.", feature: "comment-to-dm" },
      { title: "Qualify in a flow", body: "Ask course, level and city; save answers to the contact.", feature: "flow-builder" },
      { title: "Capture contact details", body: "Collect email and phone for counsellors.", feature: "lead-capture" },
      { title: "Track applicants", body: "Move students from enquiry to enrolled on a board.", feature: "sales-pipeline" },
    ],
    chat: [
      { from: "customer", text: "💬 commented: “WEBINAR”" },
      { from: "business", text: "Here's your seat for Sunday's free masterclass 🎓 [Register]" },
      { from: "customer", text: "Is there a weekend batch too?" },
      { from: "business", text: "Yes! Which city are you in? I'll share the nearest centre." },
    ],
    chatCaption: "An illustrative course-enquiry conversation.",
    features: ["comment-to-dm", "flow-builder", "lead-capture", "sales-pipeline"],
    faqs: [SAFE_FAQ],
  },
  {
    slug: "restaurants",
    navLabel: "Restaurants & Cafés",
    icon: UtensilsCrossed,
    tagline: "Menu and reservation links for everyone who comments or tags you",
    metaTitle: "Instagram Automation for Restaurants & Cafés",
    metaDescription: "Share your menu and reservation link from comments and DMs, answer timing and location questions instantly and thank guests who tag you in stories.",
    keywords: ["Instagram automation restaurant", "restaurant Instagram DM", "cafe Instagram automation", "table booking Instagram"],
    h1: "Turn food reels into full tables",
    lead: "People save your reels and ask “where is this?”. Reply with the menu, location and booking link instantly — and thank every guest who tags you.",
    challenges: [
      { title: "Busy during service", body: "Nobody can answer DMs when the kitchen is full." },
      { title: "The same three questions", body: "Menu, timings, location — all day, every day." },
      { title: "Tags without thanks", body: "Guests post about you and hear nothing back." },
    ],
    playbook: [
      { title: "Menu from comments", body: "“MENU” on a reel sends the menu and booking link.", feature: "comment-to-dm" },
      { title: "Keyword replies", body: "Timings, location and parking answered instantly.", feature: "keyword-replies" },
      { title: "Thank story tags", body: "Reward guests who mention you with a dessert on the house.", feature: "story-automation" },
      { title: "Reservation flow", body: "Collect date, time and party size for the manager.", feature: "flow-builder" },
    ],
    chat: [
      { from: "customer", text: "Are you open tonight? Table for 4?" },
      { from: "business", text: "We're open till 11 pm 🍝 What time would you like?" },
      { from: "customer", text: "8:30" },
      { from: "business", text: "Noted! Tap to confirm your table 👇 [Reserve]" },
    ],
    chatCaption: "An illustrative reservation conversation.",
    features: ["comment-to-dm", "keyword-replies", "story-automation", "flow-builder"],
    faqs: [SAFE_FAQ],
  },
  {
    slug: "real-estate",
    navLabel: "Real Estate",
    icon: Building2,
    tagline: "Brochures and site-visit links from every property reel",
    metaTitle: "Instagram Automation for Real Estate",
    metaDescription: "Send brochures and site-visit links to people who comment on walkthrough reels, qualify buyers by budget and area, and track every lead to closing.",
    keywords: ["Instagram automation real estate", "property enquiry Instagram DM", "real estate lead Instagram", "site visit booking DM"],
    h1: "Qualify property buyers straight from your reels",
    lead: "Walkthrough reels get comments from buyers and browsers alike. Send the brochure to all of them, ask budget and area in the DM, and put serious buyers on your pipeline.",
    challenges: [
      { title: "Time-wasting enquiries", body: "Agents chase people who were only curious." },
      { title: "Slow replies lose buyers", body: "Buyers enquire with several developers at once." },
      { title: "Leads in personal phones", body: "Nobody knows which enquiries were followed up." },
    ],
    playbook: [
      { title: "Brochure on comment", body: "“DETAILS” sends the brochure and a site-visit link.", feature: "comment-to-dm" },
      { title: "Qualify in a flow", body: "Ask budget, configuration and preferred area.", feature: "flow-builder" },
      { title: "Capture phone numbers", body: "Get a number for the call-back.", feature: "lead-capture" },
      { title: "Track every buyer", body: "Each qualified lead becomes a deal with an owner.", feature: "sales-pipeline" },
    ],
    chat: [
      { from: "customer", text: "💬 commented: “DETAILS”" },
      { from: "business", text: "Here's the brochure for Skyline 3BHK 🏙️ [View brochure] What's your budget?" },
      { from: "customer", text: "Around 1.2 Cr" },
      { from: "business", text: "Perfect fit! Share your number and our advisor will call you today." },
    ],
    chatCaption: "An illustrative property-enquiry conversation.",
    features: ["comment-to-dm", "flow-builder", "lead-capture", "sales-pipeline"],
    faqs: [SAFE_FAQ],
  },
  {
    slug: "agencies",
    navLabel: "Marketing Agencies",
    icon: Megaphone,
    tagline: "Run comment automations and DMs for every client",
    metaTitle: "Instagram DM Automation for Agencies",
    metaDescription: "Manage comment-to-DM automations, inboxes and reports for your clients' Instagram accounts from GramForGrow.",
    keywords: ["Instagram automation agency", "manage client Instagram DMs", "agency comment to DM", "Instagram agency tool"],
    h1: "Deliver measurable Instagram results for every client",
    lead: "Set up comment automations for each campaign, give client teams a shared inbox and show them the comments and DMs their content generated.",
    challenges: [
      { title: "Proving ROI", body: "Clients see likes, not leads." },
      { title: "Manual DM work", body: "Community managers can't keep up with campaign comments." },
      { title: "Many accounts", body: "Juggling logins across clients is risky." },
    ],
    playbook: [
      { title: "Campaign automations", body: "One comment automation per campaign post.", feature: "comment-to-dm" },
      { title: "Shared inbox per client", body: "Assign DMs to the right community manager.", feature: "team-inbox" },
      { title: "Report results", body: "Comments, DMs and response times for client reviews.", feature: "analytics" },
      { title: "Pipe leads to clients", body: "Send captured leads to the client's CRM via webhooks.", feature: "integrations-api" },
    ],
    chat: [
      { from: "customer", text: "💬 commented on the campaign reel: “OFFER”" },
      { from: "business", text: "Here's your 20% launch code: LAUNCH20 🎉 [Shop now]" },
    ],
    chatCaption: "An illustrative campaign conversation.",
    features: ["comment-to-dm", "team-inbox", "analytics", "integrations-api"],
    faqs: [
      { q: "Can I connect several client accounts?", a: "Yes — connect multiple Instagram accounts depending on your plan, and use separate workspaces for separate clients." },
      SAFE_FAQ,
    ],
  },
  {
    slug: "travel-hospitality",
    navLabel: "Travel & Hospitality",
    icon: Plane,
    tagline: "Itineraries and prices for every commenter, 24×7",
    metaTitle: "Instagram Automation for Travel & Hospitality",
    metaDescription: "Send itineraries and package prices to everyone who comments on destination reels, answer questions across time zones and capture traveller details.",
    keywords: ["Instagram automation travel", "travel agency Instagram DM", "hotel Instagram automation", "tour package DM"],
    h1: "Turn wanderlust comments into booked trips",
    lead: "Destination reels spark “how much?” comments from everywhere. Send itineraries instantly, ask travel dates and group size in the DM, and hand ready travellers to your team.",
    challenges: [
      { title: "Enquiries across time zones", body: "Travellers message when your team is asleep." },
      { title: "Price-shoppers", body: "Every package gets the same questions." },
      { title: "Slow quotes", body: "The first agency to reply usually wins." },
    ],
    playbook: [
      { title: "Itinerary on comment", body: "“TRIP” sends the itinerary and price.", feature: "comment-to-dm" },
      { title: "AI answers", body: "Visa, weather and inclusions answered from your FAQs.", feature: "ai-agent" },
      { title: "Collect trip details", body: "Dates, group size and budget in a flow.", feature: "flow-builder" },
      { title: "Take a deposit", body: "Send a payment link to confirm the booking.", feature: "payments" },
    ],
    chat: [
      { from: "customer", text: "💬 commented: “BALI”" },
      { from: "business", text: "6D/5N Bali from ₹54,999 🌴 [See itinerary] When are you planning to travel?" },
    ],
    chatCaption: "An illustrative travel-enquiry conversation.",
    features: ["comment-to-dm", "ai-agent", "flow-builder", "payments"],
    faqs: [SAFE_FAQ],
  },
];

export const solutionBySlug = (slug: string) => SOLUTIONS.find((s) => s.slug === slug);
