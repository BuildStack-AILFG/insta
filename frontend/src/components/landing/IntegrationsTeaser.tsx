import Link from "next/link";
import { ArrowRight, Webhook } from "lucide-react";
import { InstagramIcon } from "@/components/icons/BrandIcons";
import {
  MetaIcon,
  ZapierIcon,
  GoogleSheetsIcon,
  ShopifyIcon,
  SlackColorIcon,
  StripeIcon,
  CalendlyIcon,
  HubSpotIcon,
  SalesforceIcon,
  RazorpayIcon,
  ZohoIcon,
  WooCommerceIcon,
  MailchimpIcon,
  GoogleCalendarIcon,
  GoogleDriveIcon,
  GmailIcon,
  NotionIcon,
  AirtableIcon,
  ZendeskIcon,
  MakeIcon,
  IntercomIcon,
  TypeformIcon,
  WordPressIcon,
  PayPalIcon,
  TelegramIcon,
  TwilioIcon,
  QuickBooksIcon,
  GoogleAnalyticsIcon,
} from "@/components/icons/IntegrationBrandIcons";

const INTEGRATIONS = [
  { name: "Instagram", icon: InstagramIcon, color: "#e1306c" },
  { name: "Meta", icon: MetaIcon, color: "#1877F2" },
  { name: "Zapier", icon: ZapierIcon, color: "#FF4A00" },
  { name: "Google Sheets", icon: GoogleSheetsIcon, color: "#0F9D58" },
  { name: "Shopify", icon: ShopifyIcon, color: "#95BF47" },
  { name: "Slack", icon: SlackColorIcon, color: undefined },
  { name: "Stripe", icon: StripeIcon, color: "#635BFF" },
  { name: "Calendly", icon: CalendlyIcon, color: "#006BFF" },
  { name: "Webhooks", icon: Webhook, color: "#E5E7EB" },
  { name: "HubSpot", icon: HubSpotIcon, color: "#FF7A59" },
  { name: "Salesforce", icon: SalesforceIcon, color: "#00A1E0" },
  { name: "Razorpay", icon: RazorpayIcon, color: "#5B8DEF" },
  { name: "Zoho CRM", icon: ZohoIcon, color: "#E42527" },
  { name: "WooCommerce", icon: WooCommerceIcon, color: "#96588A" },
  { name: "Mailchimp", icon: MailchimpIcon, color: "#FFE01B" },
  { name: "Google Calendar", icon: GoogleCalendarIcon, color: "#4285F4" },
  { name: "Google Drive", icon: GoogleDriveIcon, color: "#4285F4" },
  { name: "Gmail", icon: GmailIcon, color: "#EA4335" },
  { name: "Notion", icon: NotionIcon, color: "#E5E7EB" },
  { name: "Airtable", icon: AirtableIcon, color: "#18BFFF" },
  { name: "Zendesk", icon: ZendeskIcon, color: "#17C3B2" },
  { name: "Make", icon: MakeIcon, color: "#A855F7" },
  { name: "Intercom", icon: IntercomIcon, color: "#E5E7EB" },
  { name: "Typeform", icon: TypeformIcon, color: "#D1D5DB" },
  { name: "WordPress", icon: WordPressIcon, color: "#21759B" },
  { name: "PayPal", icon: PayPalIcon, color: "#2E6BD6" },
  { name: "Telegram", icon: TelegramIcon, color: "#26A5E4" },
  { name: "Twilio", icon: TwilioIcon, color: "#F22F46" },
  { name: "QuickBooks", icon: QuickBooksIcon, color: "#2CA01C" },
  { name: "Google Analytics", icon: GoogleAnalyticsIcon, color: "#E37400" },
];

export default function IntegrationsTeaser() {
  return (
    <section id="integrations" style={{ backgroundColor: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            Unifying Your Workflow with <span style={{ color: "var(--brand-soft)" }}>{INTEGRATIONS.length}+</span> Plug &amp;
            Play Integrations
          </h2>
          <Link
            href="#get-started"
            className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white btn-accent shrink-0 transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Explore Integrations
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-6">
          {INTEGRATIONS.map((item) => {
            const Icon = item.icon;
            return (
              <span key={item.name} className="inline-flex items-center gap-2 text-white">
                <Icon size={22} style={{ color: item.color }} />
                <span className="text-base font-bold">{item.name}</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
