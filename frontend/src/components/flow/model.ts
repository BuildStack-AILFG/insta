import type { FlowGraph, FlowNode } from "@/lib/api";

export const TRIGGERS = [
  { id: "incoming_message", label: "Any incoming message", hint: "Runs the first time a contact writes (once per cooldown)." },
  { id: "keyword", label: "Keyword message", hint: "Runs when a message contains or equals one of your keywords." },
  { id: "contact_created", label: "New contact messages first", hint: "Runs on a new contact's very first message." },
  { id: "story_reply", label: "Story reply or mention", hint: "Runs when someone replies to or mentions you in a story." },
  { id: "event", label: "Event (API / integrations)", hint: "Runs when an event with this name is received, e.g. order_placed." },
  { id: "manual", label: "Manual / API only", hint: "Started from the dashboard's Test run or the API." },
] as const;

export type StepType =
  | "send_message" | "send_media" | "send_link_buttons" | "send_buttons" | "send_list" | "ask_question" | "condition" | "delay"
  | "add_tag" | "remove_tag" | "set_trait" | "assign_agent" | "webhook" | "ai_reply" | "handoff" | "end"
  | "create_deal" | "move_deal" | "send_payment_link";

export const STEP_META: Record<string, { label: string; group: "Messages" | "Logic" | "Contact" | "Sales" | "Advanced"; color: string; description: string }> = {
  start: { label: "Start", group: "Logic", color: "#ec4899", description: "Where the flow begins" },
  send_message: { label: "Send message", group: "Messages", color: "#2563EB", description: "A text message" },
  send_media: { label: "Send media", group: "Messages", color: "#2563EB", description: "Image, video, audio or file" },
  send_link_buttons: { label: "Link buttons", group: "Messages", color: "#2563EB", description: "Text with up to 3 buttons that open a link" },
  send_buttons: { label: "Quick replies", group: "Messages", color: "#7C3AED", description: "Up to 13 tappable replies; branch on the tap" },
  send_list: { label: "Options menu", group: "Messages", color: "#7C3AED", description: "Up to 13 options sent as quick replies" },
  ask_question: { label: "Ask a question", group: "Messages", color: "#D97706", description: "Wait for a reply, validate and save it" },
  condition: { label: "Condition", group: "Logic", color: "#DB2777", description: "Branch yes / no" },
  delay: { label: "Wait", group: "Logic", color: "#6B7280", description: "Pause for minutes, hours or days" },
  add_tag: { label: "Add tag", group: "Contact", color: "#0891B2", description: "Tag the contact" },
  remove_tag: { label: "Remove tag", group: "Contact", color: "#0891B2", description: "Remove a tag" },
  set_trait: { label: "Set detail", group: "Contact", color: "#0891B2", description: "Save a custom field" },
  assign_agent: { label: "Assign agent", group: "Contact", color: "#0891B2", description: "Assign the chat to a teammate" },
  create_deal: { label: "Create deal", group: "Sales", color: "#16A34A", description: "Add the contact to your sales pipeline" },
  move_deal: { label: "Move deal", group: "Sales", color: "#16A34A", description: "Move their open deal to another stage" },
  send_payment_link: { label: "Payment link", group: "Sales", color: "#16A34A", description: "Send a Razorpay payment link in the chat" },
  webhook: { label: "Call webhook", group: "Advanced", color: "#475569", description: "HTTP request to your system" },
  ai_reply: { label: "AI reply", group: "Advanced", color: "#9333EA", description: "Answer from your knowledge base" },
  handoff: { label: "Hand over to human", group: "Advanced", color: "#DC2626", description: "Stop automation, notify the team" },
  end: { label: "End", group: "Logic", color: "#6B7280", description: "Finish the flow" },
};

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export function defaultData(type: string): Record<string, unknown> {
  switch (type) {
    case "send_message": return { text: "" };
    case "send_media": return { media_type: "image", url: "", caption: "" };
    case "send_buttons": return { body: "", buttons: [{ id: uid("b"), title: "Yes" }, { id: uid("b"), title: "No" }] };
    case "send_list": return { body: "", button_text: "Choose", sections: [{ title: "Options", rows: [{ id: uid("r"), title: "Option 1", description: "" }, { id: uid("r"), title: "Option 2", description: "" }] }] };
    case "send_link_buttons": return { body: "", buttons: [{ title: "Open", url: "" }] };
    case "ask_question": return { question: "", key: "", save_as: "trait", validation: "text", max_retries: 3, retry_message: "Sorry, that doesn't look right. Please try again." };
    case "condition": return { match: "all", rules: [{ left: "tag", op: "eq", right: "" }] };
    case "delay": return { amount: 10, unit: "minutes" };
    case "add_tag": case "remove_tag": return { tag: "" };
    case "set_trait": return { key: "", value: "" };
    case "create_deal": return { title: "{{name}}", value: 0, stage_id: "", only_if_none: true };
    case "move_deal": return { stage_id: "" };
    case "send_payment_link": return { amount: 0, description: "", message: "Here's your secure payment link: {{link}}" };
    case "webhook": return { url: "", method: "POST" };
    case "ai_reply": return { instructions: "" };
    case "handoff": return { message: "Connecting you with a teammate — they'll reply here shortly." };
    default: return {};
  }
}

const n = (id: string, type: string, x: number, y: number, data: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x, y }, data });
const e = (source: string, target: string, sourceHandle = "next") => ({ id: `${source}-${sourceHandle}-${target}`, source, target, sourceHandle });

export const PRESETS: { id: string; label: string; description: string; trigger: string; graph: () => FlowGraph }[] = [
  { id: "blank", label: "Blank canvas", description: "Just a Start step — build it yourself.", trigger: "incoming_message", graph: () => ({ nodes: [n("start", "start", 60, 160, { label: "Start", cooldown_hours: 24 })], edges: [] }) },
  {
    id: "lead", label: "Lead qualification", trigger: "keyword", description: "Triggered by the word “demo”: greets, asks for an email (validated), asks which plan they want, tags them and hands hot leads to your team.",
    graph: () => ({
      nodes: [n("start", "start", 40, 180, { label: "Start", keywords: ["demo", "pricing"], match: "contains" }),
        n("hello", "send_message", 300, 180, { text: "Great to hear from you {{first_name}}! Let me grab a couple of details." }),
        n("email", "ask_question", 560, 180, { question: "What's your work email?", key: "email", save_as: "trait", validation: "email", max_retries: 2, retry_message: "That doesn't look like an email — could you try again?" }),
        n("plan", "send_buttons", 840, 180, { body: "Which plan are you interested in?", buttons: [{ id: "starter", title: "Starter" }, { id: "growth", title: "Growth" }] }),
        n("tag1", "add_tag", 1140, 100, { tag: "interest-starter" }), n("tag2", "add_tag", 1140, 280, { tag: "interest-growth" }),
        n("hand", "handoff", 1420, 280, { message: "Thanks! A specialist will reach out shortly." }), n("bye", "end", 1420, 100)],
      edges: [e("start", "hello"), e("hello", "email"), e("email", "plan", "success"), e("plan", "tag1", "starter"), e("plan", "tag2", "growth"), e("tag1", "bye"), e("tag2", "hand")],
    }),
  },
  {
    id: "menu", label: "Support menu", trigger: "keyword", description: "Triggered by “menu” or “help”: shows a list of topics and answers each one, or hands over to an agent.",
    graph: () => ({
      nodes: [n("start", "start", 40, 200, { label: "Start", keywords: ["menu", "help"], match: "contains" }),
        n("list", "send_list", 300, 200, { body: "How can we help you today?", button_text: "Choose a topic", sections: [{ title: "Topics", rows: [{ id: "hours", title: "Opening hours", description: "" }, { id: "orders", title: "Track my order", description: "" }, { id: "agent", title: "Talk to a person", description: "" }] }] }),
        n("hours", "send_message", 640, 60, { text: "We're open Monday–Saturday, 9am–7pm." }), n("orders", "send_message", 640, 220, { text: "Please share your order number and we'll look it up." }),
        n("agent", "handoff", 640, 380, { message: "Sure — connecting you to a teammate now." }), n("end", "end", 940, 140)],
      edges: [e("start", "list"), e("list", "hours", "hours"), e("list", "orders", "orders"), e("list", "agent", "agent"), e("hours", "end"), e("orders", "end")],
    }),
  },
  {
    id: "email-lead", label: "Freebie for an email", trigger: "keyword", description: "Triggered by “FREE”: asks for an email (validated), tags the lead and sends the download link.",
    graph: () => ({
      nodes: [n("start", "start", 40, 160, { label: "Start", keywords: ["free", "guide"], match: "contains" }),
        n("ask", "ask_question", 300, 160, { question: "Drop your email and I'll send it right over 📩", key: "email", save_as: "trait", validation: "email", max_retries: 2, retry_message: "Hmm, that doesn't look like an email — could you check it?" }),
        n("tag", "add_tag", 580, 100, { tag: "lead" }),
        n("send", "send_link_buttons", 840, 100, { body: "Here you go {{first_name}} 🎁", buttons: [{ title: "Download", url: "https://example.com/guide.pdf" }] }),
        n("human", "handoff", 580, 280, { message: "No problem — a teammate will help you here." }), n("end", "end", 1100, 100)],
      edges: [e("start", "ask"), e("ask", "tag", "success"), e("ask", "human", "failed"), e("tag", "send"), e("send", "end")],
    }),
  },
  {
    id: "callback", label: "Call-back request", trigger: "keyword", description: "Triggered by “CALL”: asks for a phone number and the best time, creates a deal and hands over to your team.",
    graph: () => ({
      nodes: [n("start", "start", 40, 160, { label: "Start", keywords: ["call", "callback"], match: "contains" }),
        n("phone", "ask_question", 300, 160, { question: "Sure! What's the best number to call you on?", key: "phone", save_as: "trait", validation: "phone", max_retries: 2 }),
        n("time", "send_buttons", 580, 160, { body: "When should we call?", buttons: [{ id: "morning", title: "Morning" }, { id: "evening", title: "Evening" }] }),
        n("deal", "create_deal", 860, 160, { title: "{{name}} - call back", value: 0, only_if_none: true }),
        n("hand", "handoff", 1120, 160, { message: "Got it — our team will call you. Thanks {{first_name}}!" })],
      edges: [e("start", "phone"), e("phone", "time", "success"), e("time", "deal", "morning"), e("time", "deal", "evening"), e("time", "deal", "default"), e("deal", "hand")],
    }),
  },
  {
    id: "story", label: "Story reply thank-you", trigger: "story_reply", description: "Thanks people who reply to or mention you in a story, tags them and shares a link to your shop.",
    graph: () => ({
      nodes: [n("start", "start", 40, 160, { label: "Start", cooldown_hours: 24 }), n("thanks", "send_message", 300, 160, { text: "Thanks for the love {{first_name}}! 💖" }),
        n("tag", "add_tag", 560, 160, { tag: "story-fan" }),
        n("shop", "send_link_buttons", 820, 160, { body: "Here's what's new this week:", buttons: [{ title: "Shop the drop", url: "https://example.com" }] }), n("end", "end", 1080, 160)],
      edges: [e("start", "thanks"), e("thanks", "tag"), e("tag", "shop"), e("shop", "end")],
    }),
  },
];

/** Outputs a step exposes: [handleId, label]. */
export function outputsFor(node: { type: string; data: Record<string, unknown> }): [string, string][] {
  const d = node.data;
  switch (node.type) {
    case "condition": return [["true", "Yes"], ["false", "No"]];
    case "ask_question": return [["success", "Answered"], ["failed", "Failed"]];
    case "send_buttons": return [...((d.buttons as { id: string; title: string }[]) ?? []).map((b) => [b.id, b.title || "Button"] as [string, string]), ["default", "Other reply"]];
    case "send_list": return [...(((d.sections as { rows: { id: string; title: string }[] }[]) ?? []).flatMap((s) => s.rows).map((r) => [r.id, r.title || "Option"] as [string, string])), ["default", "Other reply"]];
    case "webhook": return [["next", "Success"], ["error", "Error"]];
    case "end": case "handoff": return [];
    default: return [["next", ""]];
  }
}

export function summarize(node: { type: string; data: Record<string, unknown> }): string {
  const d = node.data;
  const s = (v: unknown) => String(v ?? "").slice(0, 70);
  switch (node.type) {
    case "start": return d.keywords ? `Keywords: ${(d.keywords as string[]).join(", ")}` : d.event ? `Event: ${s(d.event)}` : "Flow begins here";
    case "send_message": return s(d.text) || "Empty message";
    case "send_media": return `${s(d.media_type)}: ${s(d.url) || "no URL yet"}`;
    case "send_buttons": case "send_list": return s(d.body) || "No text yet";
    case "send_link_buttons": return s(d.body) || "No text yet";
    case "ask_question": return `${s(d.question) || "No question yet"} → ${s(d.key) || "?"}`;
    case "condition": return `${(d.rules as unknown[] | undefined)?.length ?? 0} rule(s)`;
    case "delay": return `Wait ${s(d.amount)} ${s(d.unit)}`;
    case "add_tag": case "remove_tag": return s(d.tag) || "No tag yet";
    case "set_trait": return `${s(d.key) || "?"} = ${s(d.value)}`;
    case "assign_agent": return d.user_id ? "Specific teammate" : "By workspace rules";
    case "create_deal": return s(d.title) || "Untitled deal";
    case "move_deal": return d.stage_id ? "Moves the open deal" : "Choose a stage";
    case "send_payment_link": return Number(d.amount) > 0 ? `₹${s(d.amount)} link` : "Set an amount";
    case "webhook": return `${s(d.method)} ${s(d.url) || "no URL yet"}`;
    case "ai_reply": return "Answers from your knowledge base";
    case "handoff": return s(d.message) || "Notifies your team";
    default: return "";
  }
}
