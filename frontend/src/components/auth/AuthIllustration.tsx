import {
  BarChart3,
  Megaphone,
  Target,
  Mail,
  Filter,
  Smartphone,
  MessageCircle,
  CheckCircle2,
  Users,
  TrendingUp,
  Clock,
  ThumbsUp,
  Send,
  type LucideIcon,
} from "lucide-react";

type Badge = {
  Icon: LucideIcon;
  size: number;
  variant?: "solid";
};

// Listed in clockwise order from the top; they are spaced evenly around the outer dashed ring.
const badges: Badge[] = [
  { Icon: BarChart3, size: 56 },
  { Icon: Megaphone, size: 58, variant: "solid" },
  { Icon: Smartphone, size: 54 },
  { Icon: TrendingUp, size: 50 },
  { Icon: CheckCircle2, size: 58, variant: "solid" },
  { Icon: ThumbsUp, size: 50 },
  { Icon: Send, size: 52 },
  { Icon: Clock, size: 46 },
  { Icon: Users, size: 54 },
  { Icon: MessageCircle, size: 54, variant: "solid" },
  { Icon: Filter, size: 50 },
  { Icon: Mail, size: 56 },
  { Icon: Target, size: 48 },
];

// Radius of the outer dashed ring drawn below (inset-[8%] -> 0.42 of the square), plus a fixed 6px.
const OUTER_RADIUS = 0.42;
const RADIUS_EXTRA_PX = 6;

/** Position of item `index` of `count` on a circle, clockwise from 12 o'clock, as CSS calc() values. */
function onCircle(index: number, count: number, radius: number, extraPx = 0) {
  const angle = (2 * Math.PI * index) / count;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return {
    top: `calc(50% - ${(radius * cos * 100).toFixed(3)}% - ${(extraPx * cos).toFixed(3)}px)`,
    left: `calc(50% + ${(radius * sin * 100).toFixed(3)}% + ${(extraPx * sin).toFixed(3)}px)`,
  };
}

export default function AuthIllustration() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[540px] select-none">
      <div className="absolute inset-[calc(8%-6px)] rounded-full border-2 border-dashed border-white/10" />
      <div className="absolute inset-[20%] rounded-full border-2 border-dashed border-white/[0.06]" />

      {/* The whole ring turns clockwise; each icon counter-turns so it stays upright while it travels. */}
      <div className="auth-orbit absolute inset-0">
        {badges.map(({ Icon, size, variant }, i) => (
          <div
            key={i}
            className="absolute"
            style={{ ...onCircle(i, badges.length, OUTER_RADIUS, RADIUS_EXTRA_PX), width: size, height: size, transform: "translate(-50%, -50%)" }}
          >
            <div className="auth-orbit-counter h-full w-full">
              <div
                className={`auth-badge grid h-full w-full place-items-center rounded-2xl shadow-[0_6px_20px_rgba(0,0,0,0.4)] ${
                  variant === "solid"
                    ? "auth-badge-solid bg-brand text-white"
                    : "border-2 border-white/10 bg-white/[0.04] text-brand backdrop-blur-xl"
                }`}
              >
                <Icon className="h-[46%] w-[46%]" strokeWidth={2} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute left-1/2 top-1/2 w-[94%] -translate-x-1/2 -translate-y-1/2 text-center">
        <p
          className="font-sans font-extrabold leading-[0.95] tracking-tight text-white"
          style={{ fontSize: "clamp(2rem, 6.4vw, 3.75rem)", wordBreak: "break-word" }}
        >
          GramForGrow
        </p>
      </div>
    </div>
  );
}
