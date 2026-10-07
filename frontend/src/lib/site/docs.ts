import type { Block } from "./seo";

export type Doc = {
  slug: string;
  title: string;
  description: string;
  group: "Get started" | "Build" | "Developers" | "Administer";
  body: Block[];
};

/** Public API origin shown in examples. Set NEXT_PUBLIC_API_URL at build time (the dashboard needs it too). */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.gramforgrow.in/api").replace(/\/$/, "");

export const DOCS: Doc[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description: "Create a workspace, connect your Instagram account and launch your first comment → DM automation in about ten minutes.",
    group: "Get started",
    body: [
      { type: "p", text: "DMForGrow automates Instagram comments and DMs on Meta's official Instagram API, and gives your team a shared DM inbox. This page walks you from sign-up to your first automation." },
      { type: "h2", text: "1. Create your workspace" },
      { type: "p", text: "[Sign up](/signup) with your work email and company name. You start on a free trial with limits suited to trying every feature." },
      { type: "h2", text: "2. Connect Instagram" },
      { type: "p", text: "Open **Instagram** in the dashboard and click **Connect with Instagram**. Only Professional accounts (Business or Creator) can be connected — see [Connect Instagram](/docs/connect-instagram)." },
      { type: "h2", text: "3. Create a comment automation" },
      { type: "ol", items: ["Open **Automation → Comment → DM** and click **New automation**.", "Pick one or more posts or reels (or “My next post”).", "Add keywords such as PRICE or LINK, a few public reply variations and the DM with a link button.", "Click **Go live**."] },
      { type: "h2", text: "4. Test it" },
      { type: "p", text: "From another Instagram account, comment the keyword on the post. You'll see the public reply under the comment, the DM in that account's inbox, and the result in **Comment → DM → Activity**." },
      { type: "h2", text: "5. Add your team and more automation" },
      { type: "ul", items: ["**Settings → Team** — invite teammates as Admin, Agent or Viewer", "**Instagram → Ice breakers** — questions people can tap when they open a chat", "**Keyword Replies** and **Auto-Replies** — instant answers for common DMs", "**AI Agent** — answers from your knowledge base"] },
      { type: "callout", tone: "tip", text: "The dashboard's setup checklist tracks these steps for you and links to each one." },
    ],
  },
  {
    slug: "connect-instagram",
    title: "Connect your Instagram account",
    description: "Log in with Instagram, what permissions we ask for, and how webhooks reach DMForGrow.",
    group: "Get started",
    body: [
      { type: "p", text: "DMForGrow uses the **Instagram API with Instagram Login**. You approve access in Instagram's own login screen; we never see your password and you can remove access any time from Instagram's settings." },
      { type: "h2", text: "What you need" },
      { type: "ul", items: ["An Instagram **Business** or **Creator** account (switch in the Instagram app under Settings → Account type and tools)", "Permission to manage that account's messages and comments"] },
      { type: "h2", text: "Permissions we request" },
      { type: "table", head: ["Permission", "Why"], rows: [["instagram_business_basic", "Read your username, profile picture and posts (for the post picker)"], ["instagram_business_manage_comments", "Receive comments, reply to them and send private replies"], ["instagram_business_manage_messages", "Receive and send DMs, set ice breakers"]] },
      { type: "h2", text: "Steps" },
      { type: "ol", items: ["Open **Instagram** in the dashboard and click **Connect with Instagram**.", "Log in to the account you want to automate and approve access.", "You're sent back to DMForGrow. The account card should say **Receiving comments & DMs**."] },
      { type: "callout", tone: "info", title: "Access renews itself", text: "Instagram access lasts 60 days; DMForGrow renews it automatically in the background. If access is ever revoked, the dashboard asks you to reconnect." },
      { type: "h2", text: "Troubleshooting" },
      { type: "table", head: ["Symptom", "Likely cause"], rows: [["“Switch to a Professional account”", "The account is a personal account. Switch it to Business or Creator and connect again."], ["Account connected but no comments arrive", "Click **Refresh** on the account card to switch webhooks on again."], ["DMs fail with a window error", "Instagram only allows replies within 24 hours of the person's last message."]] },
    ],
  },
  {
    slug: "comment-automations",
    title: "Comment automations",
    description: "How keyword matching, public replies, private-reply DMs and the activity log work.",
    group: "Build",
    body: [
      { type: "h2", text: "Which posts" },
      { type: "table", head: ["Option", "Watches"], rows: [["Specific posts", "The posts and reels you pick"], ["My next post", "The first post or reel you publish after creating the automation"], ["All posts", "Every post and reel, including future ones"]] },
      { type: "h2", text: "Which comments" },
      { type: "ul", items: ["**Contains a keyword** — matches whole words and phrases, ignoring case and punctuation (“price please!!” matches PRICE)", "**Is exactly a keyword** — the comment must be only the keyword", "**Any comment** — every comment on the chosen posts", "**Ignore comments that contain…** — skip comments with words like “refund”"] },
      { type: "p", text: "When several automations match, one for specific posts wins over one for all posts, and keyword automations win over “any comment”." },
      { type: "h2", text: "Replies" },
      { type: "ul", items: ["**Public reply** — posted under the comment; one of your variations is picked at random. `{{username}}` becomes @their_name.", "**DM** — sent as an Instagram private reply, optionally with up to 3 link buttons. Instagram allows one private reply per comment, within 7 days of it.", "**Follow-up flow** — when the person replies to the DM, the chosen flow starts."] },
      { type: "callout", tone: "info", text: "Your own comments — including the automatic public replies — never trigger automations. With “Only reply once per person” on, repeat comments from the same person are logged as skipped." },
      { type: "h2", text: "Activity log" },
      { type: "p", text: "**Comment → DM → Activity** lists every comment with its result: Replied, No match, Already replied or Failed (with the reason Instagram gave)." },
    ],
  },
  {
    slug: "flows",
    title: "DM flows reference",
    description: "Every step type in the flow builder, what it does and how triggers work.",
    group: "Build",
    body: [
      { type: "p", text: "A flow is a graph of steps that starts from a **trigger**. Draft as long as you like; only the published version runs. Publishing validates the flow and lists anything that needs fixing." },
      { type: "h2", text: "Triggers" },
      { type: "table", head: ["Trigger", "Starts when"], rows: [["Keyword", "An incoming DM contains or equals one of your keywords"], ["Incoming message", "Any DM arrives (with a per-contact cooldown)"], ["New contact", "Someone messages you for the first time"], ["Story reply or mention", "Someone replies to your story or mentions you in theirs"], ["Comment follow-up", "Someone replies to a comment automation's DM (set on the automation)"], ["Event", "An event with a given name arrives from the API or an integration"], ["Manual", "You run it from the dashboard or the API"]] },
      { type: "h2", text: "Steps" },
      { type: "table", head: ["Step", "What it does"], rows: [["Send message / media", "Sends text, an image, video, audio or file (from a public link)"], ["Link buttons", "Text with up to 3 buttons that open a link"], ["Quick replies / Options menu", "Up to 13 tappable replies; each option is a branch"], ["Ask a question", "Waits for a reply, validates it (text, email, number, date, choice) and saves it"], ["Condition", "Branches Yes/No on tags, saved details, answers or keywords"], ["Wait", "Pauses for minutes, hours or days"], ["Add / remove tag, Set detail", "Updates the contact"], ["Assign agent", "Assigns the chat to a person or by your assignment rules"], ["Call webhook", "Sends the contact and variables to your URL and reads the JSON response"], ["AI reply", "Answers from your knowledge base"], ["Hand over to human", "Stops automation and notifies your team"], ["Create deal / Move deal", "Adds the contact to your sales pipeline or moves their open deal"], ["Payment link", "Creates a Razorpay payment link and sends it in the chat"], ["End", "Finishes the flow"]] },
      { type: "h2", text: "Merge fields" },
      { type: "p", text: "Use `{{first_name}}`, `{{name}}`, `{{username}}`, `{{trait.city}}` for saved details and `{{var.answer}}` for answers collected earlier in the flow." },
      { type: "callout", tone: "info", title: "Instagram's reply window", text: "Flows can only message someone within 24 hours of their last message. Message steps that come due after that are skipped and logged on the run." },
      { type: "callout", tone: "warn", title: "Loops must wait", text: "A loop that never waits for the contact would run forever, so publishing rejects it. Add a question or a wait inside the loop." },
    ],
  },
  {
    slug: "pipeline-and-payments",
    title: "Sales pipeline and payments",
    description: "Set up stages, create deals, and collect payments from customers with Razorpay payment links.",
    group: "Build",
    body: [
      { type: "h2", text: "Pipeline" },
      { type: "p", text: "Open **Sales → Pipeline**. New workspaces start with *New lead, Contacted, Qualified, Proposal sent, Won* and *Lost*. Use **Stages** to rename, recolour and reorder them, set each open stage's win probability and choose whether new Instagram contacts become deals automatically." },
      { type: "ul", items: ["Drag a card to another stage; dropping into a **Won** or **Lost** stage closes the deal", "Open a deal for notes, an owner, expected close date and its activity trail", "**Sales Reports** show revenue won, win rate, average deal size, cycle time and lost reasons"] },
      { type: "h2", text: "Collect payments from customers" },
      { type: "ol", items: ["In Razorpay, generate API keys (use test mode first).", "In **Settings → Payments**, paste the Key ID and Secret and connect.", "Use **Request payment** in a chat or a deal. Enter an amount and description; the link is created on your Razorpay account."] },
      { type: "p", text: "Links update to **paid** automatically. For instant updates, add a Razorpay webhook for `payment_link.paid` pointing to your Razorpay integration's hook URL (see [Integrations](/docs/integrations)); otherwise we check open links in the background." },
      { type: "h2", text: "Your DMForGrow plan" },
      { type: "p", text: "Plans are prepaid for 1, 3 or 12 months in **Settings → Plan & billing**. GST is added at checkout and each payment produces a GST invoice you can print or save as PDF. Changing plan mid-period credits the unused time." },
    ],
  },
  {
    slug: "api-reference",
    title: "REST API reference (v1)",
    description: "DM people who messaged you, upsert contacts, track events and list contacts with an API key.",
    group: "Developers",
    body: [
      { type: "p", text: `The API base URL is \`${API_BASE}/v1\`. Create keys in **Settings → Developer**; a key is shown once. Send it as \`Authorization: Bearer lfg_live_…\` (or the \`X-API-Key\` header). Each key allows 300 requests per minute.` },
      { type: "callout", tone: "info", title: "Instagram's rules apply", text: "Instagram doesn't allow businesses to message people first. You can DM someone who has messaged or commented, within 24 hours of their last message." },
      { type: "h2", text: "Send a DM" },
      { type: "code", lang: "bash", text: `curl -X POST ${API_BASE}/v1/messages \\\n  -H "Authorization: Bearer lfg_live_XXXX" -H "Content-Type: application/json" \\\n  -d '{\n    "username": "asha.rao",\n    "text": "Your order #1042 has shipped!",\n    "buttons": [{ "title": "Track order", "url": "https://shop.example.com/t/1042" }],\n    "callback_data": "order-1042"\n  }'` },
      { type: "p", text: "Identify the person by `username` or `contact_id`. `buttons` is optional (up to 3). A successful call returns `201` with `{ \"result\": true, \"id\": \"…\", \"message_id\": \"…\", \"status\": \"sent\" }`; outside the reply window it returns `409`." },
      { type: "h2", text: "Upsert a contact" },
      { type: "code", lang: "bash", text: `curl -X POST ${API_BASE}/v1/contacts \\\n  -H "Authorization: Bearer lfg_live_XXXX" -H "Content-Type: application/json" \\\n  -d '{ "username": "asha.rao", "email": "asha@example.com", "tags": ["vip"], "traits": { "city": "Pune" } }'` },
      { type: "p", text: "Update an existing contact by `username` or `contact_id`, or create/update one by `phone` (for leads from outside Instagram). Tags are added, never removed; traits are merged. Returns `{ \"result\": true, \"id\": \"…\", \"created\": false }`." },
      { type: "h2", text: "Track an event" },
      { type: "code", lang: "bash", text: `curl -X POST ${API_BASE}/v1/events \\\n  -H "Authorization: Bearer lfg_live_XXXX" -H "Content-Type: application/json" \\\n  -d '{ "username": "asha.rao", "event": "order_placed", "properties": { "order_id": "1042", "total": "1499" } }'` },
      { type: "p", text: "Records the event on the contact and starts any published flow whose trigger listens for that event name. Returns `202`." },
      { type: "h2", text: "List contacts" },
      { type: "ul", items: ["`GET /v1/contacts?limit=50&offset=0` — paginated, with `has_next_page`, including each contact's Instagram `username`"] },
      { type: "h2", text: "Errors" },
      { type: "table", head: ["Status", "Meaning"], rows: [["401", "Missing, invalid or revoked API key"], ["402", "A plan limit was reached (for example contacts)"], ["404", "No contact found (DMs need someone who has messaged you)"], ["409", "No connected account, or the message can't be sent now (outside the 24-hour window)"], ["422", "Validation error — the message explains what to fix"], ["429", "Rate limit exceeded; retry after the `Retry-After` seconds"]] },
    ],
  },
  {
    slug: "webhooks",
    title: "Outbound webhooks",
    description: "Receive signed events at your URL when DMs, contacts, comment automations, deals or payments change.",
    group: "Developers",
    body: [
      { type: "p", text: "Add an endpoint in **Settings → Developer → Outbound webhooks** and choose events (none selected means all). We POST JSON to your URL; your endpoint should reply `2xx` within 8 seconds." },
      { type: "h2", text: "Envelope" },
      { type: "code", lang: "json", text: '{\n  "version": "1.0",\n  "timestamp": "2026-09-20T09:30:00+00:00",\n  "type": "message_received",\n  "data": { "message_id": "…", "from": "asha.rao", "type": "text", "text": "Hi" }\n}' },
      { type: "h2", text: "Events" },
      { type: "table", head: ["Group", "Events"], rows: [["Messages", "message_received, message_sent, message_failed"], ["Contacts", "contact_created, contact_opted_out, conversation_created, lead_captured"], ["Automation", "comment_automation_triggered, flow_completed"], ["Sales", "deal_created, deal_stage_changed, deal_won, deal_lost, payment_received"]] },
      { type: "h2", text: "Verify the signature" },
      { type: "p", text: "Each request has `X-LFG-Event` and `X-LFG-Signature: sha256=<hex>`, the HMAC-SHA256 of the **raw request body** with your endpoint secret. Reject requests whose signature doesn't match." },
      { type: "code", lang: "js", text: 'import crypto from "node:crypto";\n\nexport function verify(rawBody, header, secret) {\n  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");\n  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header || ""));\n}' },
      { type: "code", lang: "python", text: 'import hmac, hashlib\n\ndef verify(raw_body: bytes, header: str, secret: str) -> bool:\n    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()\n    return hmac.compare_digest(expected, header or "")' },
      { type: "callout", tone: "warn", text: "Endpoints that fail five deliveries in a row are disabled automatically. Fix the problem and re-enable the endpoint in Settings." },
    ],
  },
  {
    slug: "integrations",
    title: "Integrations",
    description: "Connect Shopify, WooCommerce, Razorpay, Stripe, Slack or any tool that can send a webhook.",
    group: "Developers",
    body: [
      { type: "p", text: "Open **Integrations**, pick a provider and follow the steps shown. Each provider sends events to a secret hook URL that only your workspace knows. We verify the provider's signature, create or update the contact (matched by phone) and record the event, which can start flows." },
      { type: "table", head: ["Provider", "Events", "Signature header"], rows: [["Shopify", "order placed, paid, shipped, cancelled, checkout abandoned", "X-Shopify-Hmac-Sha256"], ["WooCommerce", "order placed, processing, completed, cancelled", "X-WC-Webhook-Signature"], ["Razorpay", "payment captured, payment failed, order paid, payment link paid", "X-Razorpay-Signature"], ["Stripe", "payment succeeded, payment failed, checkout completed", "Stripe-Signature"], ["Generic webhook", "Any event name you send", "Optional X-LFG-Signature"], ["Slack (notifications)", "New conversations, comment automations, leads, failures, won deals, payments", "—"]] },
      { type: "h2", text: "Use events in flows" },
      { type: "p", text: "Choose **Event** as a flow's trigger and enter the event name (for example `order_placed`). Tag customers, create deals, notify your team or call a webhook when it arrives. Instagram doesn't allow businesses to message people first, so events only DM a customer who is already in an open conversation with you." },
      { type: "h2", text: "Generic webhook body" },
      { type: "code", lang: "json", text: '{\n  "phone": "919876543210",\n  "name": "Priya",\n  "email": "priya@example.com",\n  "event": "order_placed",\n  "properties": { "order_id": "1042" },\n  "tags": ["vip"],\n  "traits": { "city": "Pune" }\n}' },
      { type: "callout", tone: "tip", text: "Rotate a hook URL any time from the integration's card if you think it has leaked." },
    ],
  },
  {
    slug: "roles-and-access",
    title: "Roles and access",
    description: "What owners, admins, agents and viewers can do in a workspace.",
    group: "Administer",
    body: [
      { type: "table", head: ["Role", "Can do"], rows: [["Owner", "Everything, including billing, ownership and admin roles"], ["Admin", "Manage settings, team members (except owners and admins), integrations, billing and developer tools"], ["Agent", "Work in the inbox, contacts, automations and flows, and move deals"], ["Viewer", "Read-only access"]] },
      { type: "p", text: "Roles are checked on every request, so a change or removal applies immediately — even to someone who is signed in." },
      { type: "h2", text: "Security tips" },
      { type: "ul", items: ["Give people the lowest role that lets them do their job", "Rotate API keys when someone leaves", "Use a unique, strong password and change it if you suspect a compromise"] },
    ],
  },
];

export const docBySlug = (slug: string) => DOCS.find((d) => d.slug === slug);
export const DOC_GROUPS = ["Get started", "Build", "Developers", "Administer"] as const;
