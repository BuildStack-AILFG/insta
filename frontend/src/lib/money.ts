/** Amounts travel as integers in the smallest currency unit (paise); these helpers convert for display and input. */

const LOCALE = "en-IN";

export function fmtMoney(minor: number, currency = "INR", opts: { compact?: boolean } = {}): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(major) || opts.compact ? 0 : 2,
      ...(opts.compact ? { notation: "compact" as const, maximumFractionDigits: 1 } : {}),
    }).format(major);
  } catch {
    return `${currency} ${major.toLocaleString(LOCALE)}`;
  }
}

/** "1,250.50" / "₹1250" -> 125050. Returns null for anything that isn't a non-negative amount. */
export function toMinor(input: string): number | null {
  const cleaned = input.replace(/[₹$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

/** 125050 -> "1250.5" (for pre-filling inputs). */
export function fromMinor(minor: number): string {
  return String(minor / 100);
}
