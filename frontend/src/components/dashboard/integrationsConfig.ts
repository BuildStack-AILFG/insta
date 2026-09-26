import type { ComponentType, CSSProperties } from "react";
import { InstagramIcon } from "@/components/icons/BrandIcons";
import {
  MetaIcon,
  ZapierIcon,
  GoogleSheetsIcon,
  ShopifyIcon,
  SlackColorIcon,
  StripeIcon,
  CalendlyIcon,
  RazorpayIcon,
  GoogleCalendarIcon,
} from "@/components/icons/IntegrationBrandIcons";

export type IntegrationStatus = "connected" | "not_connected" | "needs_attention";

export type Integration = {
  id: string;
  name: string;
  description: string;
  category: "messaging" | "commerce" | "payments" | "productivity" | "automation";
  icon: ComponentType<{ className?: string; size?: number; style?: CSSProperties }>;
  iconColor?: string;
  status: IntegrationStatus;
  primary?: boolean; // Instagram — always shown first, larger
};

export const INTEGRATIONS: Integration[] = [
  {
    id: "instagram",
    name: "Instagram",
    description: "Connect your Instagram Business or Creator account to automate comments, DMs and story replies.",
    category: "messaging",
    icon: InstagramIcon,
    iconColor: "#e1306c",
    status: "not_connected",
    primary: true,
  },
  {
    id: "meta",
    name: "Meta Business",
    description: "People who DM you from an Instagram ad or an ig.me link are tagged with the ad or link they came from.",
    category: "messaging",
    icon: MetaIcon,
    iconColor: "#1877F2",
    status: "not_connected",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Send captured leads and comment-automation events to a live spreadsheet.",
    category: "productivity",
    icon: GoogleSheetsIcon,
    iconColor: "#0F9D58",
    status: "not_connected",
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Record orders on the customer's contact and start flows from order events.",
    category: "commerce",
    icon: ShopifyIcon,
    iconColor: "#95BF47",
    status: "not_connected",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Get a Slack ping for new DMs, comment automations and hand-offs to a human.",
    category: "productivity",
    icon: SlackColorIcon,
    status: "not_connected",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Send payment links in chat and get notified when they're paid.",
    category: "payments",
    icon: StripeIcon,
    iconColor: "#635BFF",
    status: "not_connected",
  },
  {
    id: "razorpay",
    name: "Razorpay",
    description: "Collect payments in Instagram DMs with Razorpay payment links.",
    category: "payments",
    icon: RazorpayIcon,
    iconColor: "#0C2451",
    status: "not_connected",
  },
  {
    id: "calendly",
    name: "Calendly",
    description: "Let contacts book a meeting straight from a chat message.",
    category: "productivity",
    icon: CalendlyIcon,
    iconColor: "#006BFF",
    status: "not_connected",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Turn booked appointments into calendar events automatically.",
    category: "productivity",
    icon: GoogleCalendarIcon,
    iconColor: "#4285F4",
    status: "not_connected",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect Instagram automations to thousands of other apps with no code.",
    category: "automation",
    icon: ZapierIcon,
    iconColor: "#FF4A00",
    status: "not_connected",
  },
];
