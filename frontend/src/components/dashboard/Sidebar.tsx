"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronsUpDown, Lock, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import BrandLogo from "@/components/ui/BrandLogo";
import { useUi } from "@/components/ui/kit";
import { GROWTH_TIER_FEATURES } from "@/lib/site/plans";
import { featureForPath, useIsLocked } from "./UpgradeGate";
import { useMobileNav } from "./MobileNav";
import { useWorkspace } from "./WorkspaceContext";
import { QUICK_LINKS, NAV_GROUPS, RAIL_LINKS, SIDEBAR_WIDTH, type NavItem, type NavGroup } from "./navConfig";

// Accordion sidebar: a tinted "Quick links" block, collapsible groups (the open one sits on a tinted panel) and the workspace/plan card
// at the bottom. Every colour is a theme variable (see globals.css), so it follows dark (black + pink) and light (blush + pink) alike.
const mix = (v: string, pct: number) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;
const PANEL_BG = mix("--brand", 7);
const HOVER_BG = mix("--foreground", 6);
const BORDER = mix("--foreground", 10);
const TEXT = mix("--foreground", 78);
const TEXT_MUTED = mix("--foreground", 45);
const COLLAPSED_KEY = "gfg_sidebar_collapsed";

function isItemActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function groupHasActiveChild(pathname: string, group: NavGroup) {
  return group.sections.some((section) => section.items.some((item) => isItemActive(pathname, item.href)));
}

/** Toast for a locked item — at most once every few seconds per item, so sweeping the mouse over the list doesn't stack toasts. */
function useLockedToast() {
  const { toast } = useUi();
  const last = useRef<Record<string, number>>({});
  return useCallback(
    (label: string, href: string) => {
      const now = Date.now();
      if (now - (last.current[label] ?? 0) < 3000) return;
      last.current[label] = now;
      const feature = featureForPath(href);
      const tier = feature && GROWTH_TIER_FEATURES.includes(feature) ? "on Growth and above" : "on every paid plan";
      toast(`Upgrade your plan to access this — ${label} is available ${tier}.`, "info");
    },
    [toast],
  );
}

function NavRow({ item, pathname, collapsed, onNavigate }: { item: NavItem; pathname: string; collapsed?: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const locked = useIsLocked(item.href);
  const active = !locked && isItemActive(pathname, item.href);
  const notifyLocked = useLockedToast();

  const onClick = (e: MouseEvent) => {
    if (locked) {
      e.preventDefault();
      notifyLocked(item.label, item.href);
      return;
    }
    onNavigate?.();
  };

  return (
    <Link
      href={item.href}
      onClick={onClick}
      onMouseEnter={locked ? () => notifyLocked(item.label, item.href) : undefined}
      aria-disabled={locked || undefined}
      aria-current={active ? "page" : undefined}
      title={collapsed ? (locked ? `${item.label} — upgrade to unlock` : item.label) : locked ? "Upgrade your plan to access this" : undefined}
      className={`group flex items-center gap-3 rounded-lg text-[14.5px] font-medium transition-colors ${collapsed ? "h-10 w-10 justify-center" : "px-3 py-2.5"} ${active ? "" : "hover:[background:var(--row-hover)]"} ${locked ? "cursor-not-allowed" : ""}`}
      style={{
        ["--row-hover" as string]: HOVER_BG,
        background: active ? "var(--brand)" : undefined,
        color: active ? "#ffffff" : locked ? TEXT_MUTED : TEXT,
      }}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.75} style={{ color: active ? "#ffffff" : locked ? TEXT_MUTED : "var(--brand-bright)" }} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && locked && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: mix("--brand", 14) }}>
          <Lock className="h-3 w-3" style={{ color: "var(--brand-bright)" }} strokeWidth={2.25} aria-label="Locked — upgrade your plan" />
        </span>
      )}
    </Link>
  );
}

function GroupBlock({ group, pathname, open, onToggle, onNavigate }: { group: NavGroup; pathname: string; open: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const Icon = group.icon;
  return (
    <div className="rounded-xl transition-colors" style={{ background: open ? PANEL_BG : undefined }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14.5px] font-medium transition-colors hover:[background:var(--row-hover)]"
        style={{ ["--row-hover" as string]: open ? "transparent" : HOVER_BG, color: TEXT }}
      >
        <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.75} style={{ color: "var(--brand-bright)" }} />
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        {group.badge === "new" && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">New</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} style={{ color: TEXT_MUTED }} />
      </button>
      {open && (
        <div className="space-y-0.5 pb-2">
          {group.sections.map((section, i) => (
            <div key={section.label ?? i} className={i > 0 ? "pt-1.5" : undefined}>
              {section.label && (
                <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-fainter)" }}>
                  {section.label}
                </p>
              )}
              {section.items.map((item) => (
                <NavRow key={item.id} item={item} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceCard({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { workspace } = useWorkspace();
  const initial = (workspace.name.trim()[0] ?? "?").toUpperCase();
  return (
    <Link
      href="/dashboard/settings?tab=billing"
      onClick={onNavigate}
      title={collapsed ? `${workspace.name} · ${workspace.plan_name} plan` : undefined}
      className={`flex items-center gap-3 rounded-xl transition-colors hover:[background:var(--row-hover)] ${collapsed ? "justify-center p-1.5" : "p-2"}`}
      style={{ ["--row-hover" as string]: HOVER_BG }}
    >
      <span className="btn-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[15px] font-bold text-white" style={{ background: "var(--brand)" }}>
        {initial}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--foreground)" }}>{workspace.name}</span>
            <span className="block truncate text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{workspace.plan_name} plan</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0" style={{ color: TEXT_MUTED }} />
        </>
      )}
    </Link>
  );
}

/** The expanded nav list — shared by the desktop sidebar and the mobile drawer. */
function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(NAV_GROUPS.filter((g) => groupHasActiveChild(pathname, g)).map((g) => g.id)));

  // Navigating into a group (e.g. from a dashboard card) opens it; groups the user opened stay open.
  useEffect(() => {
    const active = NAV_GROUPS.find((g) => groupHasActiveChild(pathname, g));
    if (active) setOpenGroups((s) => (s.has(active.id) ? s : new Set(s).add(active.id)));
  }, [pathname]);

  const toggle = (id: string) =>
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-1.5">
      <div className="rounded-xl p-1.5" style={{ background: PANEL_BG }}>
        <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium" style={{ color: "var(--ink-faint)" }}>Quick links</p>
        <div className="space-y-0.5">
          {QUICK_LINKS.map((item) => (
            <NavRow key={item.id} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
      {NAV_GROUPS.map((group) => (
        <GroupBlock key={group.id} group={group} pathname={pathname} open={openGroups.has(group.id)} onToggle={() => toggle(group.id)} onNavigate={onNavigate} />
      ))}
      <div className="space-y-0.5">
        {RAIL_LINKS.map((item) => (
          <NavRow key={item.id} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

/** Icon-only list for the collapsed desktop sidebar. A group icon re-expands the sidebar. */
function CollapsedList({ pathname, onExpand }: { pathname: string; onExpand: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {QUICK_LINKS.map((item) => (
        <NavRow key={item.id} item={item} pathname={pathname} collapsed />
      ))}
      <div className="my-2 h-px w-8" style={{ background: BORDER }} />
      {NAV_GROUPS.map((group) => {
        const active = groupHasActiveChild(pathname, group);
        return (
          <button
            key={group.id}
            type="button"
            title={group.label}
            onClick={onExpand}
            className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:[background:var(--row-hover)]"
            style={{ ["--row-hover" as string]: HOVER_BG, background: active ? PANEL_BG : undefined }}
          >
            <group.icon className="h-[19px] w-[19px]" strokeWidth={1.75} style={{ color: "var(--brand-bright)" }} />
          </button>
        );
      })}
      <div className="my-2 h-px w-8" style={{ background: BORDER }} />
      {RAIL_LINKS.map((item) => (
        <NavRow key={item.id} item={item} pathname={pathname} collapsed />
      ))}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNav();
  const [collapsed, setCollapsed] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <>
      {/* Desktop (lg+) */}
      <aside
        aria-label="Main navigation"
        className="hidden h-full shrink-0 flex-col border-r transition-[width] duration-200 ease-out lg:flex"
        style={{ width: collapsed ? SIDEBAR_WIDTH.rail : SIDEBAR_WIDTH.expanded, backgroundColor: "var(--sidebar)", borderColor: BORDER }}
      >
        <div className={`flex shrink-0 items-center pt-3 ${collapsed ? "justify-center" : "justify-end px-3"}`}>
          <button
            type="button"
            onClick={() => setCollapsedPersist(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:[background:var(--row-hover)]"
            style={{ ["--row-hover" as string]: HOVER_BG, color: TEXT_MUTED }}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          </button>
        </div>
        <nav className={`min-h-0 flex-1 overflow-y-auto overscroll-contain py-2 ${collapsed ? "px-2" : "px-3"}`}>
          {collapsed ? <CollapsedList pathname={pathname} onExpand={() => setCollapsedPersist(false)} /> : <NavList pathname={pathname} />}
        </nav>
        <div className={`shrink-0 border-t ${collapsed ? "p-2" : "p-3"}`} style={{ borderColor: BORDER }}>
          <WorkspaceCard collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile / tablet (< lg): off-canvas drawer, opened from the hamburger in the top bar */}
      <div className="lg:hidden">
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={mobileOpen ? 0 : -1}
          onClick={closeMobile}
          className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] transition-opacity duration-200 ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        />
        <aside
          aria-label="Main navigation"
          aria-hidden={!mobileOpen}
          inert={!mobileOpen}
          className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-[320px] flex-col shadow-2xl transition-transform duration-200 ease-out"
          style={{ backgroundColor: "var(--sidebar)", transform: mobileOpen ? "translateX(0)" : "translateX(-100%)" }}
        >
          <div className="flex h-14 shrink-0 items-center justify-between px-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <Link href="/dashboard" onClick={closeMobile} className="flex items-center">
              <BrandLogo size={28} textClassName="text-[16px]" />
            </Link>
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Close menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            <NavList pathname={pathname} onNavigate={closeMobile} />
          </nav>
          <div className="shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" style={{ borderColor: BORDER }}>
            <WorkspaceCard onNavigate={closeMobile} />
          </div>
        </aside>
      </div>
    </>
  );
}
