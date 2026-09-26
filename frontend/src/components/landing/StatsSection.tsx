import { MARKETING } from "@/lib/marketing/designTokens";

const STATS = [
  { value: "< 1 sec", label: "From comment to public reply and DM" },
  { value: "24×7", label: "DMs, story replies and comments answered" },
  { value: "100%", label: "Official Meta Instagram API — no password sharing" },
  { value: "13", label: "Tap-to-reply options per message in your flows" },
];

export default function StatsSection() {
  return (
    <section id="why-us" className={MARKETING.section}>
      <div className={MARKETING.container}>
        <div className="mx-auto max-w-2xl text-center">
          <p className={MARKETING.overline}>What Sets Us Apart?</p>
          <h2 className={`${MARKETING.h2} mt-3`}>Built on What Instagram Allows — and Fast Where It Counts</h2>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p
                className="text-[2.25rem] font-extrabold tracking-[-0.03em] text-brand sm:text-[2.75rem]"
                style={{ fontFamily: "var(--font-plus-jakarta)" }}
              >
                {stat.value}
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-white/60 sm:text-[14px]">{stat.label}</p>
            </div>
          ))}
        </div>

        <p className={`${MARKETING.body} mx-auto mt-6 max-w-2xl text-center`}>
          A simple, transparent, and powerful platform, built to scale with your business!
        </p>
      </div>
    </section>
  );
}
