/**
 * Small hand-built product previews for the marketing site. They replace screenshots so they stay crisp, on-theme and
 * always match the actual product (Instagram comments, DMs, stories, flows).
 */
import { AtSign, BarChart3, Bot, Check, GitBranch, Heart, Mail, MessageCircle, Send, Sparkles, Tag, Zap } from "lucide-react";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-fixed flex h-full w-full flex-col justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#1a0610] via-black to-[#2a0a1c] p-4 text-white shadow-[0_20px_48px_rgba(0,0,0,0.45)]">
      {children}
    </div>
  );
}
const Avatar = ({ c = "from-pink-500 to-orange-400" }: { c?: string }) => <span className={`h-6 w-6 shrink-0 rounded-full bg-gradient-to-br ${c}`} />;
const Them = ({ children }: { children: React.ReactNode }) => <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3 py-1.5 text-[11.5px]">{children}</p>;
const Us = ({ children }: { children: React.ReactNode }) => <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-[#9d174d] px-3 py-1.5 text-[11.5px]">{children}</p>;
const Label = ({ icon: Icon, children }: { icon: typeof Zap; children: React.ReactNode }) => (
  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-pink-300"><Icon className="h-3 w-3" />{children}</p>
);

export function CommentToDmMock() {
  return (
    <Frame>
      <Label icon={MessageCircle}>Comment on your reel</Label>
      <div className="flex items-start gap-2"><Avatar /><p className="text-[11.5px]"><b>priya.styles</b> LINK please 🙏</p></div>
      <div className="ml-7 flex items-start gap-2"><Avatar c="from-pink-600 to-pink-400" /><p className="text-[11.5px]"><b>you</b> Sent you a DM @priya.styles! 💌</p></div>
      <Label icon={Send}>Their DMs</Label>
      <div className="flex flex-col gap-1"><Them>Hey Priya! Here&apos;s the link you asked for 👇<span className="mt-1 block rounded-lg bg-black/30 py-1 text-center font-semibold">Shop the drop</span></Them></div>
    </Frame>
  );
}

export function FlowMock() {
  const steps = [["Keyword: DEMO", Zap], ["Ask for email", Mail], ["Tag: hot-lead", Tag], ["Branch on plan", GitBranch]] as const;
  return (
    <Frame>
      {steps.map(([t, Icon], i) => (
        <div key={t} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-500/25 text-pink-200"><Icon className="h-3.5 w-3.5" /></span>
          <span className="flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11.5px]">{t}</span>
          {i < steps.length - 1 && <span className="text-white/30">↓</span>}
        </div>
      ))}
    </Frame>
  );
}

export function AiMock() {
  return (
    <Frame>
      <Them>Is the vitamin C serum okay for sensitive skin?</Them>
      <Us>Yes! It&apos;s fragrance-free and dermat-tested 🌿 Most people with sensitive skin start with 3 nights a week.</Us>
      <p className="flex items-center gap-1 self-end text-[10px] text-pink-300"><Bot className="h-3 w-3" /> AI agent · answered from your FAQ</p>
    </Frame>
  );
}

export function InboxMock() {
  const rows = [["aman.fit", "Do you ship to Pune?", "You"], ["neha.glows", "Replied to your story", "Bot"], ["rahul.k", "Mentioned you in a story", "Riya"]] as const;
  return (
    <Frame>
      {rows.map(([u, t, who]) => (
        <div key={u} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5">
          <Avatar c="from-fuchsia-500 to-pink-400" />
          <div className="min-w-0 flex-1"><p className="text-[11.5px] font-semibold">{u}</p><p className="truncate text-[10.5px] text-white/55">{t}</p></div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] text-white/70">{who}</span>
        </div>
      ))}
    </Frame>
  );
}

export function LeadMock() {
  return (
    <Frame>
      <Us>Drop your email and I&apos;ll send the free guide 📩</Us>
      <Them>aman@fitclub.in</Them>
      <Us>Sent! Check your inbox ✨</Us>
      <p className="flex items-center gap-1 text-[10px] text-pink-300"><Check className="h-3 w-3" /> Saved to contact · email = aman@fitclub.in</p>
    </Frame>
  );
}

export function AnalyticsMock() {
  const bars = [30, 52, 41, 68, 60, 84, 72];
  return (
    <Frame>
      <Label icon={BarChart3}>Comments → DMs this week</Label>
      <div className="flex h-20 items-end gap-1.5">{bars.map((h, i) => <span key={i} className="flex-1 rounded-t bg-gradient-to-t from-pink-600 to-pink-300" style={{ height: `${h}%` }} />)}</div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[["1,284", "comments"], ["912", "DMs sent"], ["38%", "clicked"]].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-white/[0.06] py-1"><p className="text-[13px] font-bold">{v}</p><p className="text-[9.5px] text-white/50">{l}</p></div>
        ))}
      </div>
    </Frame>
  );
}

export function StoryMock() {
  return (
    <Frame>
      <div className="flex items-center gap-3">
        <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-b from-pink-500 via-fuchsia-600 to-orange-400">
          <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 text-[8.5px] font-semibold"><AtSign className="h-2.5 w-2.5" />you</span>
          <Heart className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 fill-white" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5"><Them>🔥🔥 obsessed</Them><Us>Thank you! Here&apos;s 10% off 💖</Us></div>
      </div>
    </Frame>
  );
}

export function IntentMock() {
  return (
    <Frame>
      <Them>how much does the combo cost??</Them>
      <p className="flex items-center gap-1 text-[10px] text-pink-300"><Sparkles className="h-3 w-3" /> Matched intent: <b>pricing</b> (no keyword needed)</p>
      <Us>The serum + toner combo is ₹999 🎉</Us>
    </Frame>
  );
}
