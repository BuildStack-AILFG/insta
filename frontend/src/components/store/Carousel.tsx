"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HeroSlide } from "@/lib/api";

/** Scrolls a snap container by one "page" (its visible width). */
function useScroller() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (el) setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const id = requestAnimationFrame(update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); cancelAnimationFrame(id); };
  }, [update]);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.9, behavior: "smooth" });
  return { ref, edges, by };
}

const arrow = "flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg)] text-[var(--fg)] shadow-sm transition hover:border-[var(--muted)] disabled:opacity-30";

/** A titled horizontal product row ("Best sellers", "New arrivals"…) that swipes on phones and has arrows on desktop. */
export function Rail({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  const { ref, edges, by } = useScroller();
  return (
    <section className="mx-auto max-w-6xl px-4 pt-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight sm:text-[26px]">{title}</h2>
          {subtitle && <p className="mt-1 text-[14px] text-[var(--muted)]">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button className={`${arrow} hidden sm:flex`} onClick={() => by(-1)} disabled={edges.start} aria-label="Previous"><ChevronLeft size={18} /></button>
          <button className={`${arrow} hidden sm:flex`} onClick={() => by(1)} disabled={edges.end} aria-label="Next"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div ref={ref} className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}

/** One slot in a Rail: two across on phones, four on desktop. */
export function RailItem({ children }: { children: ReactNode }) {
  return <div className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23.5%]">{children}</div>;
}

/** Full-width banner carousel: auto-advances, swipes, arrows and dots. */
export function HeroCarousel({ slides, slug, storeName, buttonLabel }: { slides: HeroSlide[]; slug: string; storeName: string; buttonLabel: string }) {
  const { ref } = useScroller();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = useCallback((i: number) => {
    const el = ref.current;
    if (!el) return;
    const n = (i + slides.length) % slides.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  }, [ref, slides.length]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);
  useEffect(() => {
    if (paused || slides.length < 2) return;
    const t = setInterval(() => go(index + 1), 5000);
    return () => clearInterval(t);
  }, [paused, index, go, slides.length]);

  if (!slides.length) {
    return (
      <section className="bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg))] px-4 py-20 text-center">
        <h1 className="text-[34px] font-extrabold tracking-tight sm:text-[48px]">{storeName}</h1>
        <Link href={`/s/${slug}#products`} className="mt-6 inline-block rounded-full bg-[var(--accent)] px-7 py-3 text-[15px] font-semibold text-[var(--accent-fg)]">{buttonLabel}</Link>
      </section>
    );
  }
  return (
    <section className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)}>
      <div ref={ref} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-roledescription="carousel">
        {slides.map((s, i) => (
          <div key={i} className="relative h-[62vh] max-h-[620px] min-h-[380px] w-full shrink-0 snap-start overflow-hidden bg-[var(--soft)]" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
            <img src={s.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-6 pb-14 text-white sm:pb-16">
              {s.title && <h2 className="max-w-xl text-[30px] font-extrabold leading-tight tracking-tight sm:text-[46px]">{s.title}</h2>}
              {s.subtitle && <p className="mt-2 max-w-lg text-[15px] text-white/85 sm:text-[17px]">{s.subtitle}</p>}
              <Link href={s.product_id ? `/s/${slug}/p/${s.product_id}` : `/s/${slug}#products`}
                className="mt-6 inline-block rounded-full bg-[var(--accent)] px-7 py-3 text-[15px] font-semibold text-[var(--accent-fg)] transition hover:brightness-95">
                {s.cta_label || buttonLabel}
              </Link>
            </div>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <>
          <button onClick={() => go(index - 1)} aria-label="Previous slide" className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[var(--fg)] shadow sm:flex"><ChevronLeft size={20} /></button>
          <button onClick={() => go(index + 1)} aria-label="Next slide" className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[var(--fg)] shadow sm:flex"><ChevronRight size={20} /></button>
          <div className="absolute inset-x-0 bottom-5 flex justify-center gap-2">
            {slides.map((_, i) => (
              <button key={i} onClick={() => go(i)} aria-label={`Go to slide ${i + 1}`} className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/55"}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Product photos: swipeable main image with thumbnails. */
export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const { ref } = useScroller();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);
  const go = (i: number) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: "smooth" });
  if (!images.length) return <div className="aspect-[4/5] rounded-2xl bg-[var(--soft)]" />;
  return (
    <div>
      <div className="relative">
        <div ref={ref} className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-[var(--soft)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => <img key={src} src={src} alt={i === 0 ? alt : ""} className="aspect-[4/5] w-full shrink-0 snap-start object-cover" />)}
        </div>
        {images.length > 1 && (
          <>
            <button onClick={() => go(Math.max(0, index - 1))} aria-label="Previous photo" className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow disabled:opacity-0" disabled={index === 0}><ChevronLeft size={18} /></button>
            <button onClick={() => go(Math.min(images.length - 1, index + 1))} aria-label="Next photo" className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow disabled:opacity-0" disabled={index === images.length - 1}><ChevronRight size={18} /></button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button key={src} onClick={() => go(i)} className={`h-16 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === index ? "border-[var(--accent)]" : "border-transparent opacity-70 hover:opacity-100"}`} aria-label={`Photo ${i + 1}`}>
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
