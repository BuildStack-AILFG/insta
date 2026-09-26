"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, ShieldCheck, Instagram } from "lucide-react";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { clearSession, getRefreshToken, logout } from "@/lib/api";
import { useWorkspace } from "./WorkspaceContext";

const ACCENT = "var(--brand)";
const GLASS_BORDER = "color-mix(in srgb, var(--foreground) 10%, transparent)";

type Banner = { tone: "info" | "warn" | "danger"; text: string; cta: string };

/**
 * The strip above the top bar is driven by where the workspace stands on its plan — never shown for a healthy paid plan.
 * trial: countdown (urgent in the last 3 days) · free: upgrade nudge · grace: renew now · active: renewal reminder in the last 7 days.
 */
function usePlanBanner(): Banner | null {
  const { workspace } = useWorkspace();
  const s = workspace.plan_state;
  if (!s) return null;
  const days = `${s.days_left} day${s.days_left === 1 ? "" : "s"}`;
  switch (s.kind) {
    case "trial":
      if (s.expired) return { tone: "danger", text: "Your free trial has ended. Choose a plan to keep your automations running.", cta: "Choose a plan" };
      if (s.days_left <= 3) return { tone: "warn", text: `Your free trial ends in ${days}. Subscribe to keep your automations running.`, cta: "Choose a plan" };
      return { tone: "info", text: `Free trial: ${days} left. Analytics, reports, API and integrations unlock when you upgrade.`, cta: "See plans" };
    case "free":
      return { tone: "info", text: "You're on the Free plan. Upgrade to unlock more contacts, comment automations and every feature.", cta: "See plans" };
    case "grace":
      return { tone: "danger", text: `Your ${workspace.plan_name} plan has ended. Renew now to keep your paid features.`, cta: "Renew plan" };
    case "active":
      return s.days_left <= 7 ? { tone: "warn", text: `Your ${workspace.plan_name} plan ends in ${days}.`, cta: "Renew plan" } : null;
    default:
      return null;
  }
}

const BANNER_STYLE: Record<Banner["tone"], { bar: string; btn: string }> = {
  info: { bar: "bg-brand/10 text-white/80", btn: "btn-accent bg-brand text-white hover:bg-brand-hover" },
  warn: { bar: "bg-amber-500/15 text-amber-200", btn: "bg-amber-600 text-white hover:bg-amber-500" },
  danger: { bar: "bg-red-950/60 text-red-300", btn: "bg-red-600 text-white hover:bg-red-500" },
};

export default function TopBar() {
  const router = useRouter();
  const banner = usePlanBanner();
  const { workspace, full_name, email, is_platform_admin } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Avatar initials from the signed-in user's name (e.g. "Riya Singh" → "RS"), falling back to their email, then the workspace.
  const initial =
    (full_name?.trim() || email || workspace.name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase() || "?";

  // Close the profile menu on an outside click or Escape. A document listener is used instead of a
  // fixed overlay because the top bar's backdrop-blur traps `position: fixed` inside the bar's bounds.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await logout(refreshToken);
      } catch {
        // Best-effort — clear the local session regardless.
      }
    }
    clearSession();
    router.push("/login");
  };

  return (
    <div className="sticky top-0 z-30">
      {banner && (
        <div className={`flex items-center justify-between gap-3 px-4 py-2 text-[13px] sm:px-6 ${BANNER_STYLE[banner.tone].bar}`}>
          <span>{banner.text}</span>
          <Link href="/dashboard/settings?tab=billing" className={`shrink-0 rounded px-3 py-1 text-[12.5px] font-semibold ${BANNER_STYLE[banner.tone].btn}`}>{banner.cta} →</Link>
        </div>
      )}
      <div
        className="flex h-14 items-center justify-between px-4 backdrop-blur-xl sm:px-6"
        style={{ backgroundColor: "color-mix(in srgb, var(--background) 85%, transparent)", borderBottom: `1px solid ${GLASS_BORDER}` }}
      >
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e1306c] text-white">
            <Instagram className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="text-[16px] font-normal tracking-tight text-white">GramForGrow</span>
        </Link>

        <div className="flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
          <Link
            href="/dashboard/settings"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Link>

          <div className="relative ml-1" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="btn-accent flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              {initial}
            </button>
            {menuOpen && (
              <>
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl p-3 shadow-2xl backdrop-blur-xl"
                  style={{ backgroundColor: "color-mix(in srgb, var(--surface) 94%, transparent)", border: `1px solid ${GLASS_BORDER}` }}
                >
                  <Link href="/dashboard/settings?tab=workspace" onClick={() => setMenuOpen(false)} className="-mx-1 block rounded-lg px-1 py-1 hover:bg-white/10">
                    <p className="truncate text-[13.5px] font-semibold text-white">{workspace.name}</p>
                    <p className="truncate text-[12px] text-white/50">{workspace.plan_name} plan · Manage workspace</p>
                  </Link>
                  <div className="my-2" style={{ borderTop: `1px solid ${GLASS_BORDER}` }} />
                  <Link href="/dashboard/settings?tab=account" onClick={() => setMenuOpen(false)} className="-mx-1 block rounded-lg px-1 py-1 hover:bg-white/10">
                    <p className="truncate text-[12.5px] text-white/80">{full_name || email}</p>
                    <p className="truncate text-[11.5px] text-white/40">{email} · View account</p>
                  </Link>
                  {is_platform_admin && (
                    <Link href="/admin" onClick={() => setMenuOpen(false)} className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-white/80 hover:bg-white/10">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Admin console
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-red-400 hover:bg-red-500/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
