"use client";

import { Badge } from "@/components/ui/kit";
import type { AdminState } from "@/lib/api";

export const PLAN_TONE: Record<string, "gray" | "blue" | "green" | "yellow"> = { trial: "blue", free: "gray", starter: "green", growth: "green", scale: "green", enterprise: "yellow" };

export const dateOnly = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "—");

/** A short human label for where a workspace stands on its plan. */
export function stateText(s: AdminState, endsAt: string | null): string {
  const d = `${s.days_left} day${s.days_left === 1 ? "" : "s"}`;
  switch (s.kind) {
    case "trial": return s.expired ? "Trial ended" : `Trial · ${d} left`;
    case "active": return `Active · ${d} left`;
    case "grace": return `Overdue since ${dateOnly(endsAt)}`;
    case "custom": return "Set by admin · no expiry";
    default: return "Free";
  }
}

export function StateBadge({ state, endsAt }: { state: AdminState; endsAt: string | null }) {
  const tone = state.kind === "active" ? "green" : state.kind === "trial" ? (state.days_left <= 3 || state.expired ? "yellow" : "blue") : state.kind === "grace" ? "red" : "gray";
  return <Badge tone={tone}>{stateText(state, endsAt)}</Badge>;
}

export function PlanBadge({ id, name }: { id: string; name: string }) {
  return <Badge tone={PLAN_TONE[id] ?? "gray"}>{name}</Badge>;
}

export const QUOTA_LABELS: Record<string, string> = {
  max_instagram_accounts: "Instagram accounts",
  max_team_members: "Team members",
  max_automation_flows: "Automation flows",
  max_contacts: "Contacts",
  max_comment_automations: "Comment automations",
  ai_replies_included_per_month: "AI replies / month",
  max_knowledge_sources: "AI knowledge sources",
};

export const UNLIMITED = 999_999;
