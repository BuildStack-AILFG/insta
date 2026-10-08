"use client";

import { useSyncExternalStore } from "react";

/**
 * The buyer's cart, kept on their device per store (no login on the storefront). Prices here are only for display —
 * the server prices every line again at checkout. The DM ref (who sent them, from which automation) rides along so a
 * sale that starts in a DM is still credited after they browse the store.
 */
export type CartLine = { product_id: string; variant_id: string | null; qty: number; name: string; variant: string | null; price: number; image_url: string | null };
type Cart = { lines: CartLine[]; ref: string | null };

const EVENT = "gfg-cart";
const MAX_QTY = 10;
const key = (slug: string) => `gfg_cart_${slug}`;
const EMPTY = JSON.stringify({ lines: [], ref: null });

function readRaw(slug: string): string {
  try { return window.localStorage.getItem(key(slug)) ?? EMPTY; } catch { return EMPTY; }
}

function write(slug: string, cart: Cart) {
  try { window.localStorage.setItem(key(slug), JSON.stringify(cart)); } catch { /* storage unavailable: the cart lives for this page only */ }
  window.dispatchEvent(new Event(EVENT));
}

function parse(raw: string): Cart {
  try { const c = JSON.parse(raw); return { lines: Array.isArray(c.lines) ? c.lines : [], ref: c.ref ?? null }; } catch { return { lines: [], ref: null }; }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

/** The cart as React state (empty during server rendering). */
export function useCart(slug: string): Cart {
  const raw = useSyncExternalStore(subscribe, () => readRaw(slug), () => EMPTY);
  return parse(raw);
}

const same = (a: Pick<CartLine, "product_id" | "variant_id">, b: Pick<CartLine, "product_id" | "variant_id">) => a.product_id === b.product_id && a.variant_id === b.variant_id;

export function addToCart(slug: string, line: CartLine, ref?: string | null) {
  const cart = parse(readRaw(slug));
  const existing = cart.lines.find((l) => same(l, line));
  const lines = existing
    ? cart.lines.map((l) => (same(l, line) ? { ...line, qty: Math.min(MAX_QTY, l.qty + line.qty) } : l))
    : [...cart.lines, { ...line, qty: Math.min(MAX_QTY, line.qty) }];
  write(slug, { lines, ref: ref ?? cart.ref });
}

export function setQty(slug: string, line: CartLine, qty: number) {
  const cart = parse(readRaw(slug));
  write(slug, { ...cart, lines: qty <= 0 ? cart.lines.filter((l) => !same(l, line)) : cart.lines.map((l) => (same(l, line) ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)) });
}

export function clearCart(slug: string) {
  write(slug, { lines: [], ref: null });
}
