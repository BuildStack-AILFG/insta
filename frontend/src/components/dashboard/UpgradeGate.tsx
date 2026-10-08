"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Lock, Sparkles } from "lucide-react";
import type { FeatureKey } from "@/lib/api";
import { FEATURE_LABELS, GROWTH_TIER_FEATURES } from "@/lib/site/plans";
import { useWorkspace } from "./WorkspaceContext";

/** Dashboard pages that need a plan feature. A page whose feature is switched off for the workspace's plan shows <UpgradeGate/> instead. */
const ROUTE_FEATURES: [string, FeatureKey][] = [
  ["/dashboard/conversation-analytics", "conversation_analytics"],
  ["/dashboard/sales-reports", "sales_reports"],
  ["/dashboard/assignment-rules", "assignment_rules"],
  ["/dashboard/integrations", "integrations"],
  ["/dashboard/ai-agent", "ai_agent"],
  ["/dashboard/shop", "shop"],
  ["/dashboard/giveaways", "giveaways"],
  ["/dashboard/intent-matching", "intent_matching"],
  ["/dashboard/segments", "segments"],
  ["/dashboard/pipeline", "pipeline"],
];

export function featureForPath(pathname: string): FeatureKey | null {
  return ROUTE_FEATURES.find(([p]) => pathname === p || pathname.startsWith(p + "/"))?.[1] ?? null;
}

/** False only when the plan has the feature explicitly switched off — an unknown feature is treated as available. */
export function useHasFeature(key: FeatureKey): boolean {
  return useWorkspace().workspace.features?.[key] !== false;
}

export function useIsLocked(pathname: string): boolean {
  const { workspace } = useWorkspace();
  const key = featureForPath(pathname);
  return !!key && workspace.features?.[key] === false;
}

/** Wraps dashboard pages: renders the upgrade prompt in place of a page the current plan doesn't include. */
export function RouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { workspace } = useWorkspace();
  const key = featureForPath(pathname);
  if (key && workspace.features?.[key] === false) return <UpgradeGate feature={key} />;
  return <>{children}</>;
}

export function UpgradeGate({ feature, inline = false }: { feature: FeatureKey; inline?: boolean }) {
  const { workspace, role } = useWorkspace();
  const info = FEATURE_LABELS[feature];
  const trial = workspace.plan_state?.kind === "trial";
  const canBuy = role === "owner" || role === "admin";

  return (
    <div className={inline ? "py-6" : "flex min-h-full items-center justify-center px-4 py-16 sm:px-6"}>
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-card p-8 text-center shadow-xl sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand-bright"><Lock size={24} /></span>
        <p className="mt-5 text-[12px] font-bold uppercase tracking-[0.14em] text-brand-bright">{trial ? "Locked during your free trial" : "Not in your current plan"}</p>
        <h2 className="mt-2 text-[24px] font-extrabold tracking-tight text-white">Upgrade your plan to access {info.label}</h2>
        <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-white/60">{info.blurb}</p>

        <ul className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-2 text-[12.5px] text-white/70">
          {(GROWTH_TIER_FEATURES.includes(feature) ? ["Growth", "Enterprise"] : ["Starter", "Growth", "Enterprise"]).map((p) => <li key={p} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1"><Check size={13} className="text-brand" strokeWidth={2.5} />{p}</li>)}
        </ul>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {canBuy ? (
            <Link href="/dashboard/settings?tab=billing" className="btn-accent inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-hover"><Sparkles size={15} /> See plans &amp; upgrade</Link>
          ) : (
            <p className="text-[13.5px] text-white/60">Ask your workspace owner to upgrade the plan.</p>
          )}
          <Link href="/pricing" className="rounded-xl border border-white/15 px-5 py-2.5 text-[14px] font-medium text-white/80 hover:bg-white/[0.06]">Compare plans</Link>
        </div>
      </div>
    </div>
  );
}
