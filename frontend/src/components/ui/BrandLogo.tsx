/** GramForGrow logo: "G-arrow" mark + wordmark with "Grow" in brand pink. */
export default function BrandLogo({ size = 28, className = "", textClassName = "text-[17px] sm:text-[18px]" }: { size?: number; className?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />
      <span className={`landing-logo ${textClassName}`}>
        GramFor<span className="text-[#e91e78]">Grow</span>
      </span>
    </span>
  );
}
