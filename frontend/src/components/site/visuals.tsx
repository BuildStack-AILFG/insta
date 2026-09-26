import { AtSign, Bot, Check, CheckCheck, Clock, CreditCard, FileText, GitBranch, Globe, Handshake, Heart, Mail, MessageCircle, Plug, Send, Sparkles, Store, UserCheck, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { VisualKind } from "@/lib/site/features";

/** Decorative product previews built from plain markup (no images: fast to load, crisp at any size, theme-aware). Content is sample data. */

function Frame({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-3 text-[11.5px] font-medium text-white/45">{title}</span>
        <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/35">Sample data</span>
      </div>
      {children}
    </div>
  );
}

/** Chat bubbles keep Instagram-DM-style colours in both themes. */
function Bubble({ me, children, meta }: { me?: boolean; children: ReactNode; meta?: ReactNode }) {
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div className={`theme-fixed max-w-[80%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug ${me ? "rounded-br-sm bg-[#9d174d] text-white" : "rounded-bl-sm bg-[#262626] text-white"}`}>
        {children}
        {meta && <div className="mt-1 flex justify-end gap-1 text-[10px] text-white/50">{meta}</div>}
      </div>
    </div>
  );
}

const Chip = ({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "green" | "amber" | "blue" }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${{ gray: "bg-white/[0.08] text-white/60", green: "bg-emerald-500/15 text-pink-300", amber: "bg-amber-500/15 text-amber-300", blue: "bg-sky-500/15 text-sky-300" }[tone]}`}>{children}</span>
);

function Inbox() {
  const rows = [["asha.rao", "Is this available in M?", "2", true], ["kabir.s", "Replied to your story", "", false], ["meera.shah", "What are your timings?", "1", false], ["vikram.fit", "Mentioned you in a story", "", false]] as const;
  return (
    <Frame title="Inbox">
      <div className="grid grid-cols-[42%_1fr] text-white">
        <div className="border-r border-white/10">
          {rows.map(([n, m, c, active]) => (
            <div key={n} className={`flex items-center gap-2.5 px-3 py-2.5 ${active ? "bg-brand/10" : ""}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold">{n[0]}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-semibold">{n}</p><p className="truncate text-[11.5px] text-white/45">{m}</p></div>
              {c && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white btn-accent">{c}</span>}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 p-3">
          <div className="flex flex-wrap gap-1.5"><Chip tone="green"><UserCheck size={10} /> Riya</Chip><Chip tone="amber"><Clock size={10} /> 18h left</Chip><Chip>vip</Chip></div>
          <Bubble>Is this available in size M?</Bubble>
          <Bubble me meta={<><span>10:42</span><CheckCheck size={12} className="text-sky-300" /></>}>Yes! Want me to send the link?</Bubble>
          <div className="mt-auto flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11.5px] text-white/40">Type / for quick replies <Send size={13} className="ml-auto text-brand" /></div>
        </div>
      </div>
    </Frame>
  );
}

function Comments() {
  return (
    <Frame title="Comment → DM · Reel: serum launch">
      <div className="grid gap-3 p-4 text-white sm:grid-cols-2">
        <div className="space-y-2.5">
          <div className="flex items-start gap-2"><span className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-pink-500 to-orange-400" /><p className="text-[12px]"><b>priya.styles</b> PRICE please 😍</p></div>
          <div className="ml-8 flex items-start gap-2"><span className="h-6 w-6 shrink-0 rounded-full bg-brand" /><p className="text-[12px]"><b>you</b> Sent you a DM @priya.styles! 💌</p></div>
          <div className="flex flex-wrap gap-1.5 pt-1"><Chip tone="green"><Check size={10} /> Keyword: price</Chip><Chip>Once per person</Chip></div>
        </div>
        <div className="theme-fixed space-y-2 rounded-xl bg-black p-3">
          <Bubble me>Hey @priya.styles! Here&apos;s the price list 👇<div className="mt-1.5 rounded-md bg-white/10 py-1 text-center text-[11px] text-sky-300">See prices</div></Bubble>
          <Bubble>is there a combo?</Bubble>
        </div>
        <div className="col-span-full grid grid-cols-3 gap-2 text-center">{[["Comments", "1,284"], ["DMs sent", "912"], ["Replies", "1,040"]].map(([l, v]) => <div key={l} className="rounded-xl border border-white/10 bg-card p-2"><p className="text-[15px] font-bold">{v}</p><p className="text-[10.5px] text-white/45">{l}</p></div>)}</div>
      </div>
    </Frame>
  );
}

function Node({ icon: Icon, title, sub, tone = "blue", className = "" }: { icon: typeof Zap; title: string; sub: string; tone?: "blue" | "amber" | "green" | "pink"; className?: string }) {
  const c = { blue: "bg-blue-500/15 text-blue-300", amber: "bg-amber-500/15 text-amber-300", green: "bg-emerald-500/15 text-pink-300", pink: "bg-pink-500/15 text-pink-300" }[tone];
  return (
    <div className={`w-[46%] rounded-xl border border-white/10 bg-card p-2.5 ${className}`}>
      <div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-md ${c}`}><Icon size={13} /></span><p className="text-[12px] font-semibold text-white">{title}</p></div>
      <p className="mt-1 truncate text-[11px] text-white/45">{sub}</p>
    </div>
  );
}

function Flow() {
  return (
    <Frame title="Flow builder">
      <div className="relative h-[300px] p-4">
        <svg className="absolute inset-0 h-full w-full text-white/25" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 400 300" preserveAspectRatio="none">
          <path d="M100 62 V92 H100" /><path d="M100 128 C100 150 300 140 300 168" /><path d="M300 208 V232" /><path d="M100 128 V232" strokeDasharray="4 4" />
        </svg>
        <Node icon={Zap} title="Trigger" sub='Keyword: "demo"' tone="green" className="absolute left-[4%] top-4" />
        <Node icon={MessageCircle} title="Ask question" sub="What's your budget?" className="absolute left-[4%] top-[92px]" />
        <Node icon={GitBranch} title="Condition" sub="Budget ≥ ₹50,000?" tone="pink" className="absolute right-[4%] top-[160px]" />
        <Node icon={Handshake} title="Create deal" sub="Qualified · assign Riya" tone="green" className="absolute right-[4%] top-[232px]" />
        <Node icon={Send} title="Send resources" sub="Brochure + follow-up" tone="amber" className="absolute left-[4%] top-[232px]" />
      </div>
    </Frame>
  );
}

function Ai() {
  return (
    <Frame title="AI agent">
      <div className="space-y-2.5 p-4">
        <Bubble>What&apos;s your return policy for sale items?</Bubble>
        <Bubble me meta={<span className="flex items-center gap-1"><Bot size={11} /> AI agent</span>}>Sale items can be returned within 7 days if unused and in original packaging. Refunds go back to your original payment method in 5–7 business days.</Bubble>
        <div className="flex justify-end gap-1.5"><Chip tone="blue"><FileText size={10} /> Source: Returns policy</Chip></div>
        <Bubble>Can I speak to someone about a damaged item?</Bubble>
        <Bubble me meta={<span className="flex items-center gap-1"><UserCheck size={11} /> Handed to Riya</span>}>Of course — I&apos;m bringing in a teammate now.</Bubble>
      </div>
    </Frame>
  );
}

function Replies() {
  const rows = [["Welcome message", "Hi {{first_name}}! Thanks for writing to us 👋", true], ["Away message", "We're closed now. We'll reply at 10 AM.", true], ["Keyword: price", "Our plans start at ₹799/month — see the list 👉", true], ["Delayed reply", "Sorry for the wait — someone will be with you shortly.", false]] as const;
  return (
    <Frame title="Auto-replies">
      <div className="space-y-2.5 p-4">
        {rows.map(([t, m, on]) => (
          <div key={t} className="flex items-center gap-3 rounded-xl border border-white/10 bg-card p-3">
            <div className="min-w-0 flex-1"><p className="text-[12.5px] font-semibold text-white">{t}</p><p className="truncate text-[11.5px] text-white/45">{m}</p></div>
            <span className={`flex h-5 w-9 items-center rounded-full p-0.5 ${on ? "justify-end bg-brand" : "justify-start bg-white/15"}`}><span className="h-4 w-4 rounded-full bg-white" /></span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Pipeline() {
  const cols: [string, string, [string, string][]][] = [["New lead", "#38bdf8", [["Sharma Traders", "₹45,000"], ["Neha Jain", "₹18,500"]]], ["Qualified", "#fbbf24", [["Aarav Homes", "₹2,40,000"]]], ["Proposal sent", "#fb923c", [["Bloom Salon", "₹32,000"], ["Kiran Coaching", "₹60,000"]]], ["Won", "#22c55e", [["Delight Foods", "₹85,000"]]]];
  return (
    <Frame title="Sales pipeline">
      <div className="grid grid-cols-4 gap-2 p-3">
        {cols.map(([n, color, cards]) => (
          <div key={n} className="rounded-xl bg-white/[0.03] p-2">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white"><span className="h-2 w-2 rounded-full" style={{ background: color }} /><span className="truncate">{n}</span></div>
            <div className="space-y-1.5">{cards.map(([t, v]) => <div key={t} className="rounded-lg border border-white/10 bg-card p-2"><p className="truncate text-[11px] font-medium text-white">{t}</p><p className="mt-0.5 text-[11px] text-white/50">{v}</p></div>)}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Payments() {
  return (
    <Frame title="Chat · payment link">
      <div className="space-y-2.5 p-4">
        <Bubble>Yes, please book the annual plan.</Bubble>
        <Bubble me>
          <p>Great! Here&apos;s your secure payment link 👇</p>
          <div className="theme-fixed mt-2 overflow-hidden rounded-lg bg-[#0b141a] text-white">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2"><CreditCard size={14} className="text-pink-300" /><span className="text-[12px] font-semibold">Annual plan</span></div>
            <div className="px-3 py-2"><p className="text-[18px] font-bold">₹23,988</p><p className="text-[10.5px] text-white/50">UPI · Cards · Netbanking</p><div className="mt-2 rounded-md bg-emerald-600 py-1.5 text-center text-[12px] font-semibold">Pay now</div></div>
          </div>
        </Bubble>
        <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 py-2 text-[12px] font-medium text-pink-300"><Check size={14} /> Paid · deal moved to Won</div>
      </div>
    </Frame>
  );
}

function Stories() {
  return (
    <Frame title="Story replies & mentions">
      <div className="flex items-center gap-4 p-5 text-white">
        <div className="relative h-44 w-28 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-pink-500 via-fuchsia-600 to-orange-400">
          <span className="absolute left-2 top-2 flex items-center gap-1 text-[10px] font-semibold"><AtSign size={11} />glowstudio</span>
          <Heart size={18} className="absolute bottom-2 right-2 fill-white" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Bubble>🔥🔥 obsessed with this</Bubble>
          <Bubble me>Thank you! Here&apos;s 10% off your first order 💖 Code: GLOW10</Bubble>
          <div className="flex flex-wrap gap-1.5"><Chip tone="green"><Check size={10} /> Tagged story-fan</Chip><Chip tone="blue">Flow: story thank-you</Chip></div>
        </div>
      </div>
    </Frame>
  );
}

function Leads() {
  return (
    <Frame title="Lead capture in DMs">
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="theme-fixed space-y-2 rounded-xl bg-black p-3">
          <Bubble me>Want the free skincare guide? Drop your email 📩</Bubble>
          <Bubble>asha@mail.com</Bubble>
          <Bubble me>Sent! Check your inbox ✨</Bubble>
        </div>
        <div className="space-y-2 text-white">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><Mail size={14} className="text-brand" /> Contact updated</p>
          <div className="rounded-lg border border-white/10 bg-card p-2.5 text-[11.5px] text-white/60">@asha.rao<br /><span className="text-white">email: asha@mail.com</span><br /><span className="text-white">interest: skincare</span></div>
          <div className="flex gap-1.5"><Chip tone="green">lead</Chip><Chip>Sent to Google Sheets</Chip></div>
        </div>
      </div>
    </Frame>
  );
}

function Analytics() {
  const bars = [30, 44, 38, 62, 55, 78, 70, 92, 84, 66, 74, 96];
  return (
    <Frame title="Instagram analytics">
      <div className="space-y-4 p-4 text-white">
        <div className="grid grid-cols-3 gap-2">{[["DMs", "12.4k"], ["First reply", "4s"], ["Comments → DM", "71%"]].map(([l, v]) => <div key={l} className="rounded-xl border border-white/10 bg-card p-2.5"><p className="text-[10.5px] text-white/45">{l}</p><p className="text-[16px] font-bold">{v}</p></div>)}</div>
        <div className="flex h-28 items-end gap-1.5">{bars.map((h, i) => <div key={i} className="flex-1 rounded-t bg-brand/80" style={{ height: `${h}%` }} />)}</div>
        <div className="flex items-center gap-2 text-[11px] text-white/45"><Sparkles size={12} /> Busiest hours: 11 AM – 1 PM</div>
      </div>
    </Frame>
  );
}

function Integrations() {
  const items: [typeof Store, string][] = [[Store, "Shopify"], [Store, "WooCommerce"], [CreditCard, "Razorpay"], [CreditCard, "Stripe"], [MessageCircle, "Slack"], [Globe, "Webhooks & API"]];
  return (
    <Frame title="Integrations">
      <div className="p-5">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-2 text-[12.5px] font-semibold text-white"><Plug size={14} className="text-brand" /> GramForGrow</div>
        <div className="grid grid-cols-3 gap-2.5">{items.map(([Icon, n]) => <div key={n} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-card px-2 py-3 text-center"><Icon size={18} className="text-white/70" /><span className="text-[11.5px] font-medium text-white">{n}</span><Chip tone="green">Connected</Chip></div>)}</div>
      </div>
    </Frame>
  );
}

const MAP: Record<VisualKind, () => ReactNode> = { inbox: Inbox, comments: Comments, flow: Flow, ai: Ai, replies: Replies, pipeline: Pipeline, payments: Payments, stories: Stories, leads: Leads, analytics: Analytics, integrations: Integrations };

export default function Visual({ kind }: { kind: VisualKind }) {
  const C = MAP[kind];
  return <C />;
}

/** A standalone phone-style chat used on solution pages. */
export function ChatMock({ messages, title = "glowstudio.in" }: { messages: { from: "customer" | "business"; text: string }[]; title?: string }) {
  return (
    <div aria-hidden="true" className="theme-fixed mx-auto w-full max-w-sm overflow-hidden rounded-[28px] border border-white/15 bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-2.5 border-b border-white/10 bg-[#121212] px-4 py-3 text-white"><span className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 to-orange-400" /><div><p className="text-[13px] font-semibold">{title}</p><p className="text-[10.5px] text-pink-300">Active now</p></div></div>
      <div className="space-y-2 p-4">{messages.map((m, i) => <Bubble key={i} me={m.from === "business"}>{m.text}</Bubble>)}</div>
    </div>
  );
}
