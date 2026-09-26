import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Instagram,
  Inbox,
  ClipboardCheck,
  Zap,
  MessageSquareReply,
  MessageCircleReply,
  AtSign,
  Bot,
  Workflow,
  Sparkles,
  Kanban,
  Users2,
  BarChart3,
  LineChart,
  Plug,
  UserCog,
  ShieldCheck,
  Gift,
  Heart,
  CalendarClock,
  Clapperboard,
  Rocket,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavSection = {
  /** Sub-heading within a group's flyout panel. Omit for an unlabeled section. */
  label?: string;
  items: NavItem[];
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  sections: NavSection[];
  badge?: "new";
};

/** Flat, always-visible rail icons — no flyout panel, click navigates directly. */
export const QUICK_LINKS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "instagram", label: "Instagram", href: "/dashboard/instagram", icon: Instagram },
  { id: "inbox", label: "Inbox", href: "/dashboard/inbox", icon: Inbox },
  { id: "contacts", label: "Contacts", href: "/dashboard/contacts", icon: ClipboardCheck },
];

/** Grouped rail icons — click opens a flyout panel listing that section's pages. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "automation",
    label: "Automation",
    icon: Zap,
    sections: [
      {
        label: "Instagram triggers",
        items: [
          { id: "comment-automations", label: "Comment → DM", href: "/dashboard/comment-automations", icon: MessageCircleReply },
          { id: "custom-replies", label: "Keyword Replies", href: "/dashboard/custom-replies", icon: AtSign },
          { id: "auto-replies", label: "Auto-Replies", href: "/dashboard/auto-replies", icon: MessageSquareReply },
        ],
      },
      {
        label: "Build",
        items: [
          { id: "flow-builder", label: "Flow Builder", href: "/dashboard/flow-builder", icon: Workflow },
          { id: "ai-agent", label: "AI Agent", href: "/dashboard/ai-agent", icon: Bot },
          { id: "intent-matching", label: "Intent Matching", href: "/dashboard/intent-matching", icon: Sparkles },
        ],
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    icon: Clapperboard,
    badge: "new",
    sections: [
      {
        items: [
          { id: "scheduler", label: "Scheduler", href: "/dashboard/scheduler", icon: CalendarClock },
          { id: "insights", label: "Insights", href: "/dashboard/insights", icon: LineChart },
        ],
      },
    ],
  },
  {
    id: "engagement",
    label: "Engagement",
    icon: Heart,
    sections: [
      {
        items: [
          { id: "moderation", label: "Moderation", href: "/dashboard/moderation", icon: ShieldCheck },
          { id: "giveaways", label: "Giveaways", href: "/dashboard/giveaways", icon: Gift },
          { id: "growth", label: "DM Links, QR & Bio", href: "/dashboard/growth", icon: Rocket },
        ],
      },
    ],
  },
  {
    id: "crm",
    label: "Leads & Sales",
    icon: Kanban,
    sections: [
      {
        items: [
          { id: "pipeline", label: "Pipeline", href: "/dashboard/pipeline", icon: Kanban },
          { id: "segments", label: "Segments", href: "/dashboard/segments", icon: Users2 },
          { id: "assignment-rules", label: "Assignment Rules", href: "/dashboard/assignment-rules", icon: UserCog },
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    sections: [
      {
        items: [
          { id: "conversation-analytics", label: "Analytics", href: "/dashboard/conversation-analytics", icon: BarChart3 },
          { id: "sales-reports", label: "Sales Reports", href: "/dashboard/sales-reports", icon: LineChart },
        ],
      },
    ],
  },
];

/** Flat, single-page rail icons that sit after the groups. */
export const RAIL_LINKS: NavItem[] = [
  { id: "integrations", label: "Integrations", href: "/dashboard/integrations", icon: Plug },
];

export function findNavItemByHref(href: string): NavItem | undefined {
  for (const item of QUICK_LINKS) {
    if (item.href === href) return item;
  }
  for (const group of NAV_GROUPS) {
    for (const section of group.sections) {
      for (const item of section.items) {
        if (item.href === href) return item;
      }
    }
  }
  for (const item of RAIL_LINKS) {
    if (item.href === href) return item;
  }
  return undefined;
}

export const SIDEBAR_WIDTH = { rail: 72, panel: 260 } as const;
