import { Clock, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { MARKETING } from "@/lib/marketing/designTokens";

const STATS = [
  { Icon: Zap, value: "< 1 sec", title: "Instant replies", label: "From comment to public reply and DM" },
  { Icon: Clock, value: "24×7", title: "Always on", label: "DMs, story replies and comments answered" },
  { Icon: ShieldCheck, value: "100%", title: "Official Meta API", label: "Instagram's approved API — no password sharing" },
  { Icon: Sparkles, value: "13", title: "Quick replies", label: "Tap-to-reply options per message in your flows" },
];

export default function StatsSection() {
  return (
    <section id="why-us" className={MARKETING.section}>
      <div className={MARKETING.container}>
        <div className="mx-auto max-w-2xl text-center">
          <p className={MARKETING.overline}>What Sets Us Apart?</p>
          <h2 className={`${MARKETING.h2} mt-3`}>Built on What Instagram Allows — and Fast Where It Counts</h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map(({ Icon, value, title, label }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-white/[0.06]"
            >
              <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:opacity-60" />
              <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                <Icon className="h-5 w-5" />
              </span>
              <p
                className="relative mt-5 text-[2.5rem] font-extrabold leading-none tracking-[-0.03em] text-brand"
                style={{ fontFamily: "var(--font-plus-jakarta)" }}
              >
                {value}
              </p>
              <h3 className="relative mt-3 text-[16px] font-bold text-white">{title}</h3>
              <p className="relative mt-1.5 text-[13.5px] leading-relaxed text-white/60">{label}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 flex w-fit items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.06] px-5 py-2.5 text-center text-[14px] font-medium text-white/70">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          A simple, transparent and powerful platform, built to scale with your business.
        </p>
      </div>
    </section>
  );
}
