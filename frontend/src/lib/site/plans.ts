/**
 * Public plan catalogue — the fallback the marketing site shows if the live price list (`GET /api/public/plans`, see livePlans.ts) can't be
 * reached. Keep in step with backend/app/services/plan_catalog.py; the platform admin edits the live values in the admin console.
 * Prices are rupees per month, before 18% GST, for each billing period.
 *
 * Commercial model: the free trial is the whole product with tiny outbound-messaging limits and a few advanced features locked. Both paid
 * plans unlock every feature and differ only in volume, so choosing a plan is a question of "how much", never "which features".
 */

export type PlanId = "starter" | "growth" | "enterprise";
export type Period = "monthly" | "yearly";

export const PERIODS: { id: Period; label: string; months: number }[] = [
  { id: "monthly", label: "Monthly", months: 1 },
  { id: "yearly", label: "Yearly", months: 12 },
];

export const GST_PERCENT = 18;
export const TRIAL_DAYS = 14;

export type Limit = number | "Unlimited";
export type Limits = { numbers: Limit; seats: Limit; contacts: Limit; automations: Limit; flows: Limit; ai: Limit; knowledge: Limit };

export type PlanInfo = {
  id: PlanId;
  name: string;
  /** Who it's for — the line under the plan name. */
  audience: string;
  perMonth: Record<Period, number> | null;
  highlight?: boolean;
  limits: Limits;
};

export type FeatureKey = "ai_agent" | "conversation_analytics" | "automation_reports" | "sales_reports" | "assignment_rules" | "api_access" | "integrations";

/** What the free trial can and can't do (mirrors the trial row in the database). */
export type TrialInfo = { days: number; limits: Limits; features: Record<FeatureKey, boolean> };

export const FEATURE_LABELS: Record<FeatureKey, { label: string; blurb: string }> = {
  ai_agent: { label: "AI agent", blurb: "Answers customers automatically from your knowledge base." },
  conversation_analytics: { label: "Conversation analytics", blurb: "Response times, volumes and agent performance." },
  automation_reports: { label: "Automation reports", blurb: "Comments matched, DMs sent and clicks for every automation." },
  sales_reports: { label: "Sales reports", blurb: "Pipeline, win-rate and revenue reports." },
  assignment_rules: { label: "Auto-assignment rules", blurb: "Route new chats to the right teammate automatically." },
  api_access: { label: "API keys & webhooks", blurb: "Sync contacts and receive events in your own systems." },
  integrations: { label: "App integrations", blurb: "Slack, Shopify, WooCommerce, Razorpay and other event triggers." },
};

export const PLANS: PlanInfo[] = [
  {
    id: "starter",
    name: "Starter",
    audience: "For a brand or creator automating its first Instagram posts.",
    perMonth: { monthly: 799, yearly: 639 },
    limits: { numbers: 1, seats: 3, contacts: 2000, automations: 20, flows: 5, ai: 500, knowledge: 3 },
  },
  {
    id: "growth",
    name: "Growth",
    audience: "For teams running comment automations on every post, every day.",
    perMonth: { monthly: 1299, yearly: 1039 },
    highlight: true,
    limits: { numbers: 3, seats: 8, contacts: 10000, automations: 100, flows: 20, ai: 2000, knowledge: 10 },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    audience: "For high-volume sales and support desks with custom needs.",
    perMonth: null,
    limits: { numbers: "Unlimited", seats: "Unlimited", contacts: "Unlimited", automations: "Unlimited", flows: "Unlimited", ai: "Unlimited", knowledge: "Unlimited" },
  },
];

export const TRIAL: TrialInfo = {
  days: TRIAL_DAYS,
  limits: { numbers: 1, seats: 3, contacts: 1000, automations: 5, flows: 5, ai: 200, knowledge: 2 },
  features: { ai_agent: true, conversation_analytics: false, automation_reports: false, sales_reports: false, assignment_rules: false, api_access: false, integrations: false },
};

/** Everything both paid plans and Enterprise include, whatever the volume. */
export const EVERY_PLAN = [
  "Comment → DM & story reply automations",
  "Shared DM inbox with assignment",
  "Keyword replies, ice breakers & DM flows",
  "AI agent with human hand-over",
  "Sales pipeline & Razorpay payment links",
  "Analytics, automation & sales reports",
  "API keys, webhooks & app integrations",
];

export const ENTERPRISE_EXTRAS = ["Custom limits & invoicing", "Guided onboarding & migration", "Security review & DPA", "Named account manager"];

export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export const fmtLimit = (v: Limit) => (v === "Unlimited" ? "Unlimited" : v.toLocaleString("en-IN"));

export const monthsOf = (period: Period) => PERIODS.find((p) => p.id === period)!.months;

/** Percentage saved per month by paying for `period` up front, rounded. */
export const savingPercent = (p: PlanInfo, period: Period) => (p.perMonth && period !== "monthly" && p.perMonth.monthly ? Math.round((1 - p.perMonth[period] / p.perMonth.monthly) * 100) : 0);

/** "About ₹27 a day" — the small-number framing that makes a monthly price feel light. */
export const perDay = (perMonth: number) => Math.round(perMonth / 30);

/** The headline limits as short bullets, generated from the (possibly admin-edited) numbers. */
export function limitBullets(l: Limits): string[] {
  const n = (v: Limit) => fmtLimit(v);
  return [
    `${n(l.numbers)} Instagram account${l.numbers === 1 ? "" : "s"}`,
    `${n(l.seats)} team member${l.seats === 1 ? "" : "s"}`,
    `${n(l.contacts)} contacts`,
    `${n(l.automations)} comment automations`,
    `${n(l.flows)} automation flows`,
    `${n(l.ai)} AI replies / month`,
  ];
}
