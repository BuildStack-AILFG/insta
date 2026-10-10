"use client";

import { Anton } from "next/font/google";
import { ArrowUpRight, AtSign, MessageCircle, MousePointer2, Zap, Heart, Send } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { ZapierIcon, ShopifyIcon, SlackColorIcon } from "@/components/icons/IntegrationBrandIcons";

const anton = Anton({ subsets: ["latin"], weight: "400" });

type CardSpec = {
  key: string;
  left: string;
  top: string;
  rotate: number;
  color: string | null;
  darkColor?: string;
  icon: React.ReactNode;
};

// Bare Instagram-automation icon marks (no card chrome), cascading right-and-down —
// comments, mentions, DMs and the automation bolt that ties them together.
const LEFT_CARDS: CardSpec[] = [
  { key: "meta", left: "5%", top: "5.2%", rotate: -6, color: "#F43F5E", icon: <Heart className="h-full w-full" /> },
  { key: "bolt", left: "12.8%", top: "11.2%", rotate: -5, color: "#111827", darkColor: "#F5F6F2", icon: <Zap className="h-full w-full" /> },
  { key: "ig", left: "20.6%", top: "17.2%", rotate: -4, color: "#e1306c", icon: <Send className="h-full w-full" /> },
  { key: "comment", left: "28.4%", top: "21.2%", rotate: -2, color: "#f472b6", icon: <MessageCircle className="h-full w-full" /> },
  { key: "mention", left: "36.2%", top: "24.2%", rotate: 24, color: "#F59E0B", icon: <AtSign className="h-full w-full" /> },
];

const RIGHT_CARDS: CardSpec[] = [
  { key: "zapier", left: "0%", top: "0%", rotate: -6, color: "#FF4A00", icon: <ZapierIcon className="h-full w-full" /> },
  { key: "slack", left: "30%", top: "16%", rotate: -3, color: null, icon: <SlackColorIcon className="h-full w-full" /> },
  { key: "shopify", left: "60%", top: "32%", rotate: 8, color: "#95BF47", icon: <ShopifyIcon className="h-full w-full" /> },
];

function Spark({ left, top, size = "3cqw", rotate = 0, color = "#6d1a3a" }: { left: string; top: string; size?: string; rotate?: number; color?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="absolute transition-[stroke] duration-500"
      style={{ left, top, width: size, height: size, transform: `rotate(${rotate}deg)` }}
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M13 2.5 10 8" />
      <path d="M20.5 6.5 15.5 10" />
      <path d="M22 15.5l-5.5-1.5" />
    </svg>
  );
}

function LeftCardStack({ dark }: { dark: boolean }) {
  return (
    <>
      {LEFT_CARDS.map((c, i) => (
        <div
          key={c.key}
          className="absolute lfg-card-float flex items-center justify-center"
          style={{ left: c.left, top: c.top, width: "8.6cqw", height: "13.5cqw", animationDelay: `${i * 0.18}s` }}
        >
          <div
            className="drop-shadow-[0_10px_18px_rgba(0,0,0,0.3)] transition-colors duration-500"
            style={{
              width: "7cqw",
              height: "7cqw",
              color: (dark && c.darkColor) || c.color || undefined,
              transform: `rotate(${c.rotate}deg)`,
            }}
          >
            {c.icon}
          </div>
        </div>
      ))}
    </>
  );
}

function RightCardStack() {
  return (
    <div className="absolute inset-0">
      {RIGHT_CARDS.map((c, i) => (
        <div
          key={c.key}
          className="absolute flex items-center justify-center lfg-card-float"
          style={{ left: c.left, top: c.top, width: "40%", height: "62%", animationDelay: `${i * 0.18}s` }}
        >
          <div
            className="drop-shadow-[0_10px_18px_rgba(0,0,0,0.3)]"
            style={{ width: "70%", height: "70%", color: c.color ?? undefined, transform: `rotate(${c.rotate}deg)` }}
          >
            {c.icon}
          </div>
        </div>
      ))}
    </div>
  );
}

function DesktopHero({ onGetStarted, onBookDemo }: { onGetStarted?: () => void; onBookDemo?: () => void }) {
  const { isDark, toggle } = useTheme();

  return (
    <div
      onClick={toggle}
      className={`theme-fixed relative mx-auto hidden max-w-[1200px] cursor-pointer overflow-hidden rounded-[32px] border-[6px] border-white/10 transition-colors duration-500 md:block sm:border-[8px] ${
        isDark ? "bg-black" : "bg-[#db2777]"
      }`}
      style={{ containerType: "inline-size" }}
    >
      <div className="relative w-full" style={{ aspectRatio: "1662 / 785" }}>
        <LeftCardStack dark={isDark} />

        <div aria-hidden="true"
          className={`${anton.className} absolute leading-[0.85] tracking-tight transition-colors duration-500 ${
            isDark ? "text-[#F5F6F2]" : "text-white"
          }`}
          style={{ left: "40%", top: "14.6%", width: "46%", fontSize: "8.1cqw" }}
        >
          Comments
        </div>
        <div aria-hidden="true"
          className={`${anton.className} absolute leading-[0.85] tracking-[-0.01em] transition-colors duration-500 ${
            isDark ? "text-[#F5F6F2]" : "text-white"
          }`}
          style={{ left: "50.7%", top: "33.8%", width: "46%", fontSize: "6.3cqw" }}
        >
          That turn
        </div>
        <div aria-hidden="true"
          className={`${anton.className} absolute leading-[0.85] tracking-tight transition-colors duration-500`}
          style={{
            left: "41%",
            top: "48.4%",
            width: "56%",
            fontSize: "6.2cqw",
            color: isDark ? "#f9a8d4" : "#FFFFFF",
            textShadow: isDark
              ? "0 0 18px #0B1712, 0 0 18px #0B1712, 0 0 30px #0B1712"
              : "0 0 18px #db2777, 0 0 18px #db2777, 0 0 30px #db2777",
          }}
        >
          Into Sales
        </div>

        <MousePointer2
          className={`absolute h-[2.7cqw] w-[2.7cqw] drop-shadow-[0_4px_6px_rgba(0,0,0,0.3)] transition-colors duration-500 ${
            isDark ? "fill-white text-white" : "fill-black text-black"
          }`}
          style={{ left: "15.5%", top: "42.9%", transform: "rotate(-2deg)" }}
        />
        <Spark left="12.8%" top="39.5%" size="3cqw" rotate={240} color={isDark ? "#f9a8d4" : "#000000"} />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-pressed={isDark}
          aria-label="Toggle preview theme"
          className="absolute flex items-center rounded-full bg-[#6d1a3a] shadow-[0_10px_22px_rgba(157,23,77,0.35)] transition-colors duration-300 active:scale-95"
          style={{ left: "75%", top: "16%", width: "9.6cqw", height: "5.4cqw", padding: "0.7cqw", transform: "rotate(-16deg)" }}
        >
          <span
            className="aspect-square h-full rounded-full bg-white transition-transform duration-300 ease-out"
            style={{ transform: isDark ? "translateX(0)" : "translateX(4.2cqw)" }}
          />
        </button>
        <Spark left="85.4%" top="11.5%" size="3cqw" color={isDark ? "#f9a8d4" : "#000000"} />

        <div className="absolute" style={{ left: "78%", top: "50%", width: "21%", height: "25%" }}>
          <RightCardStack />
        </div>
        <Spark left="96.9%" top="53.5%" size="2.6cqw" rotate={-30} color={isDark ? "#f9a8d4" : "#000000"} />

        <p
          className={`absolute text-center leading-snug transition-colors duration-500 ${
            isDark ? "text-white/40" : "text-white/85"
          }`}
          style={{ left: "50%", top: "67.5%", width: "min(40cqw, 560px)", transform: "translateX(-50%)", fontSize: "1.5cqw" }}
        >
          Someone comments “PRICE” — DMForGrow replies and slides into their DMs in under a second.
        </p>

        <div
          className="absolute flex flex-col items-center gap-3"
          style={{ left: "50%", top: "80.9%", transform: "translateX(-50%)" }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGetStarted?.();
            }}
            className={`flex items-center justify-between gap-6 rounded-full pl-8 pr-2 font-bold transition-colors duration-300 hover:-translate-y-0.5 ${
              isDark ? "bg-[#ec4899] text-white" : "bg-black text-white"
            }`}
            style={{ width: "clamp(300px, 27.4cqw, 400px)", height: "clamp(58px, 5.4cqw, 72px)", fontSize: "clamp(16px, 1.7cqw, 18px)" }}
          >
            Get started
            <span
              className="flex shrink-0 items-center justify-center rounded-full transition-colors duration-300"
              style={{ width: "clamp(44px, 5.2cqw, 52px)", height: "clamp(44px, 5.2cqw, 52px)", backgroundColor: isDark ? "#f9a8d4" : "#000000" }}
            >
              <ArrowUpRight className={`-mt-1 h-1/2 w-1/2 transition-colors duration-300 ${isDark ? "text-[#0B1712]" : "text-white"}`} />
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBookDemo?.();
            }}
            className={`text-[13px] font-semibold underline underline-offset-4 transition-colors duration-300 ${
              isDark ? "text-white/40 hover:text-white" : "text-white/85 hover:text-white"
            }`}
          >
            or book a live demo
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileHero({ onGetStarted, onBookDemo }: { onGetStarted?: () => void; onBookDemo?: () => void }) {
  const { isDark, toggle } = useTheme();

  const mobileCards: CardSpec[] = [
    { key: "meta", left: "0%", top: "6%", rotate: -10, color: "#F43F5E", icon: <Heart className="h-full w-full" /> },
    { key: "bolt", left: "19%", top: "0%", rotate: -5, color: "#111827", darkColor: "#F5F6F2", icon: <Zap className="h-full w-full" /> },
    { key: "ig", left: "38%", top: "4%", rotate: 3, color: "#e1306c", icon: <Send className="h-full w-full" /> },
    { key: "comment", left: "57%", top: "2%", rotate: 8, color: "#f472b6", icon: <MessageCircle className="h-full w-full" /> },
    { key: "mention", left: "76%", top: "8%", rotate: 16, color: "#F59E0B", icon: <AtSign className="h-full w-full" /> },
  ];

  return (
    <div
      onClick={toggle}
      className={`theme-fixed relative mx-auto cursor-pointer overflow-hidden rounded-[28px] border-[5px] border-white/10 px-6 py-10 transition-colors duration-500 md:hidden ${
        isDark ? "bg-black" : "bg-[#db2777]"
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-pressed={isDark}
        aria-label="Toggle preview theme"
        className="absolute right-5 top-5 flex h-6 w-11 items-center rounded-full bg-[#6d1a3a] p-1 transition-colors duration-300 active:scale-95"
      >
        <span
          className="aspect-square h-full rounded-full bg-white transition-transform duration-300 ease-out"
          style={{ transform: isDark ? "translateX(0)" : "translateX(1.25rem)" }}
        />
      </button>

      <div aria-hidden="true"
        className={`${anton.className} text-center leading-[0.85] tracking-tight transition-colors duration-500 ${isDark ? "text-[#F5F6F2]" : "text-white"}`}
        style={{ fontSize: "15vw" }}
      >
        Comments
      </div>
      <div aria-hidden="true"
        className={`${anton.className} mt-1 text-center leading-[0.85] tracking-tight transition-colors duration-500 ${isDark ? "text-[#F5F6F2]" : "text-white"}`}
        style={{ fontSize: "8vw" }}
      >
        That turn
      </div>
      <div aria-hidden="true"
        className={`${anton.className} text-center leading-[0.85] tracking-tight transition-colors duration-500`}
        style={{ fontSize: "13vw", color: isDark ? "#f9a8d4" : "#FFFFFF" }}
      >
        Into Sales
      </div>

      <div className="relative mx-auto mt-8 h-[100px] w-[260px]">
        {mobileCards.map((c, i) => (
          <div
            key={c.key}
            className="absolute flex h-[70px] w-[70px] items-center justify-center drop-shadow-[0_8px_14px_rgba(0,0,0,0.3)] transition-colors duration-500 lfg-card-float"
            style={{
              left: c.left,
              top: c.top,
              color: (isDark && c.darkColor) || c.color || undefined,
              transform: `rotate(${c.rotate}deg)`,
              animationDelay: `${i * 0.18}s`,
            }}
          >
            {c.icon}
          </div>
        ))}
      </div>

      <p
        className={`mx-auto mt-8 max-w-[320px] text-center text-[15px] leading-snug transition-colors duration-500 ${
          isDark ? "text-white/40" : "text-white/85"
        }`}
      >
        Someone comments “PRICE” — DMForGrow replies and slides into their DMs in under a second.
      </p>

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onGetStarted?.();
          }}
          className={`flex w-full max-w-[320px] items-center justify-between gap-4 rounded-full py-4 pl-7 pr-2 text-base font-bold transition-colors duration-300 ${
            isDark ? "bg-[#ec4899] text-white" : "bg-black text-white"
          }`}
        >
          Get started
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
            style={{ backgroundColor: isDark ? "#f9a8d4" : "#000000" }}
          >
            <ArrowUpRight className={`-mt-0.5 h-5 w-5 transition-colors duration-300 ${isDark ? "text-[#0B1712]" : "text-white"}`} />
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBookDemo?.();
          }}
          className={`text-[13px] font-semibold underline underline-offset-4 transition-colors duration-300 ${
            isDark ? "text-white/40 hover:text-white" : "text-white/85 hover:text-white"
          }`}
        >
          or book a live demo
        </button>
      </div>
    </div>
  );
}

export default function PremiumHero({ onGetStarted, onBookDemo }: { onGetStarted?: () => void; onBookDemo?: () => void }) {
  return (
    <section className="bg-black px-3 pt-24 sm:px-4 sm:pt-28">
      {/* The visible headline is split into decorative pieces (desktop + mobile copies), so the page's one H1 lives here for search engines and screen readers. */}
      <h1 className="sr-only">Instagram comment automation — comments that turn into sales</h1>
      <DesktopHero onGetStarted={onGetStarted} onBookDemo={onBookDemo} />
      <MobileHero onGetStarted={onGetStarted} onBookDemo={onBookDemo} />
    </section>
  );
}
