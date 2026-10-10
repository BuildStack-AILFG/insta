/** DMForGrow logo: "G-arrow" mark + wordmark with "Grow" in brand pink. `tile` puts the mark on a white rounded square, for coloured backgrounds the pink would blend into. */
export default function BrandLogo({ size = 28, className = "", textClassName = "text-[17px] sm:text-[18px]", tile = false }: { size?: number; className?: string; textClassName?: string; tile?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  const mark = <img src="/logo-mark.png" alt="" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {tile ? (
        <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white" style={{ padding: Math.round(size * 0.18) }}>
          {mark}
        </span>
      ) : (
        mark
      )}
      <span className={`landing-logo ${textClassName}`}>
        DMFor<span className="text-[#e91e78]">Grow</span>
      </span>
    </span>
  );
}
