import { PLANS, TRIAL, type FeatureKey, type Limit, type Limits, type PlanInfo, type TrialInfo } from "./plans";

/**
 * The price list the marketing site renders. Server-side only: it asks the backend for the live plans (so a price the admin changes shows up
 * within minutes, no redeploy) and falls back to the static catalogue in plans.ts if the API is down or returns something unexpected.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const UNLIMITED = 999_999;

type ApiPlan = { id: string; name: string; per_month: { monthly: number | null; yearly: number | null }; quotas: Record<string, number>; features: Record<string, boolean> };
type ApiResponse = { plans: ApiPlan[]; trial: { days: number; quotas: Record<string, number>; features: Record<string, boolean> } };

export type PublicPricing = { plans: PlanInfo[]; trial: TrialInfo; live: boolean };

const limit = (v: number | undefined, fallback: Limit): Limit => (typeof v !== "number" ? fallback : v < 0 || v >= UNLIMITED ? "Unlimited" : v);

function toLimits(q: Record<string, number>, base: Limits): Limits {
  return {
    numbers: limit(q.max_instagram_accounts, base.numbers), seats: limit(q.max_team_members, base.seats), contacts: limit(q.max_contacts, base.contacts),
    automations: limit(q.max_comment_automations, base.automations), flows: limit(q.max_automation_flows, base.flows), ai: limit(q.ai_replies_included_per_month, base.ai),
    knowledge: limit(q.max_knowledge_sources, base.knowledge),
  };
}

export async function getPublicPricing(): Promise<PublicPricing> {
  try {
    const res = await fetch(`${API_URL}/public/plans`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as ApiResponse;
    const plans: PlanInfo[] = PLANS.map((base) => {
      const live = data.plans.find((p) => p.id === base.id);
      if (!live) return base;
      const { monthly, yearly } = live.per_month;
      return {
        ...base,
        name: live.name || base.name,
        perMonth: monthly ? { monthly: Math.round(monthly / 100), yearly: Math.round((yearly ?? monthly) / 100) } : null,
        limits: toLimits(live.quotas, base.limits),
      };
    });
    const trial: TrialInfo = {
      days: data.trial.days || TRIAL.days,
      limits: toLimits(data.trial.quotas, TRIAL.limits),
      features: { ...TRIAL.features, ...(data.trial.features as Record<FeatureKey, boolean>) },
    };
    return { plans, trial, live: true };
  } catch {
    return { plans: PLANS, trial: TRIAL, live: false };
  }
}
