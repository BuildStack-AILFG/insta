/** GramForGrow marketing design system — full black + glass surfaces, brand green #ec4899. */

export const BRAND = {
  green: {
    50: '#E6F6F1',
    100: '#BFE8DB',
    200: '#99DBC6',
    300: '#4DBE9D',
    400: '#1AA37F',
    500: '#ec4899',
    600: '#ec4899',
    700: '#db2777',
    800: '#006247',
    900: '#004A35',
  },
  hero: '#000000',
  heroLight: '#050505',
  heroMuted: '#0A0A0A',
  ink: '#FFFFFF',
  slate: 'rgba(255,255,255,0.6)',
  muted: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.1)',
  surface: '#050505',
};

export const MARKETING = {
  page: 'min-h-screen bg-black text-white',
  section: 'py-10 md:py-14 lg:py-16',
  sectionTight: 'py-8 md:py-10',
  container: 'max-w-7xl mx-auto px-6 lg:px-8',
  containerNarrow: 'max-w-4xl mx-auto px-6 lg:px-8',
  containerWide: 'max-w-[1280px] mx-auto px-6 lg:px-8',
  overline: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-brand',
  h1: 'font-[family-name:var(--font-plus-jakarta)] text-[2.25rem] sm:text-[2.75rem] lg:text-[3.25rem] font-bold tracking-[-0.02em] text-white leading-[1.08]',
  h2: 'font-[family-name:var(--font-plus-jakarta)] text-[1.75rem] sm:text-[2.25rem] font-bold tracking-[-0.02em] text-white leading-tight',
  h3: 'font-[family-name:var(--font-plus-jakarta)] text-xl font-semibold text-white',
  body: 'text-[15px] sm:text-base text-white/60 leading-relaxed',
  bodyLarge: 'text-lg sm:text-xl text-white/60 leading-relaxed',
  card: 'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
  cardHover:
    'transition-all duration-300 hover:bg-white/[0.06] hover:border-brand/40 hover:-translate-y-0.5',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-[15px] font-semibold text-white hover:bg-brand-hover transition-all duration-200 shadow-lg shadow-brand/20',
  btnGreen:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-[15px] font-semibold text-white hover:bg-brand-hover transition-all duration-200 shadow-lg shadow-brand/20',
  btnOutline:
    'inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-[15px] font-semibold text-white hover:bg-white/[0.08] hover:border-brand/50 transition-all duration-200',
  link: 'text-brand font-medium hover:text-brand-soft transition-colors',
  gradientHero: 'bg-black',
  gradientDark: 'bg-gradient-to-br from-black via-[#001a12] to-brand/30',
  glass: 'bg-white/[0.04] backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]',
};
