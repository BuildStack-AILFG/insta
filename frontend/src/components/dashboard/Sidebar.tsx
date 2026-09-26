"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, Menu, X } from "lucide-react";
import { useIsLocked } from "./UpgradeGate";
import { QUICK_LINKS, NAV_GROUPS, RAIL_LINKS, SIDEBAR_WIDTH, type NavItem, type NavGroup } from "./navConfig";

// Black + glass in the dark theme, cream + green in the light one — every colour below is a theme variable
// (see globals.css), so this file doesn't care which is active. Row layout/spacing (16px/500 Inter, 8px
// padding/gap, 4px radius) is kept from the earlier verified-against-Interakt pass; only colors changed here.
const mix = (v: string, pct: number) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;
const ACCENT = "var(--brand)";
const ACCENT_SOFT = mix("--brand", 18);
const TEXT_DEFAULT = mix("--foreground", 70);
const TEXT_ACTIVE = "var(--foreground)";
const ROW_HOVER_BG = mix("--foreground", 7);
const SECTION_TITLE_COLOR = "var(--ink-faint)";
const SUBSECTION_TITLE_COLOR = "var(--ink-fainter)";

const GLASS_BG = mix("--sidebar", 82);
const GLASS_BORDER = mix("--foreground", 10);

function isItemActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function groupHasActiveChild(pathname: string, group: NavGroup) {
  return group.sections.some((section) => section.items.some((item) => isItemActive(pathname, item.href)));
}

function PanelRow({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;
  const locked = useIsLocked(item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center rounded"
      style={{
        gap: 8,
        padding: 8,
        borderRadius: 4,
        backgroundColor: active ? ACCENT_SOFT : hovered ? ROW_HOVER_BG : "transparent",
        borderLeft: active ? `3px solid ${ACCENT}` : "3px solid transparent",
        color: active || hovered ? TEXT_ACTIVE : TEXT_DEFAULT,
        fontFamily: "Inter, sans-serif",
        fontSize: 16,
        fontWeight: 500,
        lineHeight: "20px",
      }}
    >
      <Icon className="h-5 w-5 shrink-0" style={{ color: active ? ACCENT : TEXT_DEFAULT }} strokeWidth={1.75} />
      <span className="truncate">{item.label}</span>
      {locked && <Lock className="ml-auto h-3.5 w-3.5 shrink-0" style={{ color: TEXT_DEFAULT }} strokeWidth={2} aria-label="Upgrade to unlock" />}
    </Link>
  );
}

function RailButton({
  icon: Icon,
  label,
  active,
  href,
  onClick,
  onHoverChange,
}: {
  icon: NavItem["icon"];
  label: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
  onHoverChange?: (hovering: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const handleEnter = () => {
    setHovered(true);
    onHoverChange?.(true);
  };
  const handleLeave = () => {
    setHovered(false);
    onHoverChange?.(false);
  };

  const content = <Icon className="h-5 w-5" style={{ color: active ? "#F8F9F2" : TEXT_DEFAULT }} strokeWidth={1.75} />;
  const sharedProps = {
    title: label,
    onMouseEnter: handleEnter,
    onMouseLeave: handleLeave,
    className: "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
    style: { backgroundColor: active ? ACCENT : hovered ? ROW_HOVER_BG : "transparent" },
  };

  if (href) {
    return (
      <Link href={href} onClick={onClick} {...sharedProps}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} {...sharedProps}>
      {content}
    </button>
  );
}

function GroupPanel({ group, pathname, onNavigate }: { group: NavGroup; pathname: string; onNavigate?: () => void }) {
  return (
    <div
      className="flex h-full w-[260px] flex-col overflow-y-auto px-3 py-4 backdrop-blur-xl"
      style={{ backgroundColor: GLASS_BG }}
    >
      <p className="mb-2 flex items-center gap-1.5 px-2" style={{ fontSize: 12, fontWeight: 500, color: SECTION_TITLE_COLOR }}>
        {group.label}
        {group.badge === "new" && (
          <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">New</span>
        )}
      </p>
      <div className="space-y-3">
        {group.sections.map((section, i) => (
          <div key={section.label ?? i}>
            {section.label && (
              <p className="mb-1 px-2" style={{ fontSize: 12, fontWeight: 500, color: SUBSECTION_TITLE_COLOR }}>
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <PanelRow key={item.id} item={item} active={isItemActive(pathname, item.href)} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const activeGroup =
    NAV_GROUPS.find((g) => g.id === hoveredGroupId) ?? NAV_GROUPS.find((g) => groupHasActiveChild(pathname, g)) ?? null;

  const clearHover = () => setHoveredGroupId(null);
  const handleQuickLinkClick = () => {
    setMobileOpen(false);
  };

  const rail = (
    <div className="flex h-full w-[72px] shrink-0 flex-col items-center border-r py-4" style={{ backgroundColor: "var(--sidebar)", borderColor: GLASS_BORDER }}>
      <Link href="/dashboard" className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg text-white btn-accent" style={{ backgroundColor: ACCENT }}>
        <span className="text-[13px] font-extrabold">G</span>
      </Link>

      <div className="flex flex-col gap-1">
        {QUICK_LINKS.map((item) => (
          <RailButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            href={item.href}
            active={isItemActive(pathname, item.href) && !activeGroup}
            onClick={handleQuickLinkClick}
            onHoverChange={(hovering) => hovering && clearHover()}
          />
        ))}
      </div>

      <div className="my-3 h-px w-8" style={{ backgroundColor: GLASS_BORDER }} />

      <div className="flex flex-col gap-1">
        {NAV_GROUPS.map((group) => {
          const firstHref = group.sections[0]?.items[0]?.href ?? "#";
          return (
            <RailButton
              key={group.id}
              icon={group.icon}
              label={group.label}
              href={firstHref}
              active={activeGroup?.id === group.id}
              onClick={handleQuickLinkClick}
              onHoverChange={(hovering) => setHoveredGroupId(hovering ? group.id : null)}
            />
          );
        })}
      </div>

      <div className="my-3 h-px w-8" style={{ backgroundColor: GLASS_BORDER }} />

      <div className="flex flex-col gap-1">
        {RAIL_LINKS.map((item) => (
          <RailButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            href={item.href}
            active={isItemActive(pathname, item.href)}
            onClick={handleQuickLinkClick}
            onHoverChange={(hovering) => hovering && clearHover()}
          />
        ))}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {!mobileOpen && (
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-lg text-white shadow-md btn-accent"
            style={{ backgroundColor: ACCENT }}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close menu backdrop"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
          />
        )}
        <aside
          className="fixed left-0 top-0 z-50 flex h-full w-[300px] flex-col shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out"
          style={{ backgroundColor: GLASS_BG, transform: mobileOpen ? "translateX(0)" : "translateX(-100%)" }}
        >
          <div className="flex items-center justify-end p-3" style={{ borderBottom: `1px solid ${GLASS_BORDER}` }}>
            <button type="button" onClick={() => setMobileOpen(false)} className="text-white/60 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-1 overflow-hidden">
            <div className="w-[64px] shrink-0 overflow-y-auto">{rail}</div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-0.5">
                {QUICK_LINKS.map((item) => (
                  <PanelRow key={item.id} item={item} active={isItemActive(pathname, item.href)} onNavigate={() => setMobileOpen(false)} />
                ))}
                {RAIL_LINKS.map((item) => (
                  <PanelRow key={item.id} item={item} active={isItemActive(pathname, item.href)} onNavigate={() => setMobileOpen(false)} />
                ))}
              </div>
              <div className="mt-3 space-y-3">
                {NAV_GROUPS.map((group) => (
                  <div key={group.id}>
                    <p className="mb-1 flex items-center gap-1.5 px-2" style={{ fontSize: 12, fontWeight: 500, color: SECTION_TITLE_COLOR }}>
                      {group.label}
                      {group.badge === "new" && (
                        <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">New</span>
                      )}
                    </p>
                    <div className="space-y-2">
                      {group.sections.map((section, i) => (
                        <div key={section.label ?? i}>
                          {section.label && (
                            <p className="mb-1 px-2" style={{ fontSize: 12, fontWeight: 500, color: SUBSECTION_TITLE_COLOR }}>
                              {section.label}
                            </p>
                          )}
                          <div className="space-y-0.5">
                            {section.items.map((item) => (
                              <PanelRow key={item.id} item={item} active={isItemActive(pathname, item.href)} onNavigate={() => setMobileOpen(false)} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </>
    );
  }

  const panelWidth = activeGroup ? SIDEBAR_WIDTH.panel : 0;

  return (
    <div
      className="flex h-full shrink-0 transition-[width] duration-150 ease-out"
      style={{ width: SIDEBAR_WIDTH.rail + panelWidth }}
      onMouseLeave={clearHover}
    >
      {rail}
      {activeGroup && (
        <div style={{ borderRight: `1px solid ${GLASS_BORDER}` }}>
          <GroupPanel group={activeGroup} pathname={pathname} />
        </div>
      )}
    </div>
  );
}
