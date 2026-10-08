"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Toggle } from "@/components/ui/kit";
import type { OptionGroup, Product, VariantInput } from "@/lib/api";
import { fromMinor, toMinor } from "@/lib/money";

/** Editable options ("Size: S, M, L") and one row per combination, with its own stock and optional price. */
export type VariantDraft = { groups: { name: string; values: string }[]; rows: Record<string, { price: string; stock: string; enabled: boolean }> };

const split = (values: string) => values.split(",").map((v) => v.trim()).filter((v, i, all) => v && all.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
const keyOf = (opts: Record<string, string>) => Object.entries(opts).map(([k, v]) => `${k.toLowerCase()}=${v.toLowerCase()}`).sort().join("|");

export function draftFrom(p: Product | null): VariantDraft {
  const rows: VariantDraft["rows"] = {};
  for (const v of p?.variants ?? []) rows[keyOf(v.options)] = { price: v.price ? fromMinor(v.price) : "", stock: v.stock === null ? "" : String(v.stock), enabled: v.enabled };
  return { groups: (p?.options ?? []).map((g) => ({ name: g.name, values: g.values.join(", ") })), rows };
}

export function combos(d: VariantDraft): { key: string; title: string; options: Record<string, string> }[] {
  const groups = d.groups.map((g) => ({ name: g.name.trim(), values: split(g.values) })).filter((g) => g.name && g.values.length);
  if (!groups.length) return [];
  let out: Record<string, string>[] = [{}];
  for (const g of groups) out = out.flatMap((o) => g.values.map((v) => ({ ...o, [g.name]: v })));
  return out.map((options) => ({ key: keyOf(options), title: groups.map((g) => options[g.name]).join(" / "), options }));
}

/** What the API takes, or the first problem to fix. */
export function toInput(d: VariantDraft): { options: OptionGroup[]; variants: VariantInput[]; problem: string | null } {
  const filled = d.groups.filter((g) => g.name.trim() || g.values.trim());
  if (!filled.length) return { options: [], variants: [], problem: null };
  if (filled.some((g) => !g.name.trim() || !split(g.values).length)) return { options: [], variants: [], problem: "Each option needs a name and at least one value." };
  if (new Set(filled.map((g) => g.name.trim().toLowerCase())).size !== filled.length) return { options: [], variants: [], problem: "Give the options different names." };
  const variants: VariantInput[] = [];
  for (const c of combos(d)) {
    const row = d.rows[c.key] ?? { price: "", stock: "", enabled: true };
    const price = row.price.trim() ? toMinor(row.price) : null;
    if (row.price.trim() && (price === null || price < 100)) return { options: [], variants: [], problem: `The price for ${c.title} isn't valid.` };
    variants.push({ options: c.options, price, stock: row.stock.trim() === "" ? null : Math.max(0, parseInt(row.stock, 10) || 0), enabled: row.enabled });
  }
  if (variants.length > 100) return { options: [], variants: [], problem: "That's more than 100 combinations — use fewer values." };
  return { options: filled.map((g) => ({ name: g.name.trim(), values: split(g.values) })), variants, problem: null };
}

export default function VariantsEditor({ value, onChange, basePrice }: { value: VariantDraft; onChange: (d: VariantDraft) => void; basePrice: string }) {
  const rows = combos(value);
  const setGroup = (i: number, p: Partial<VariantDraft["groups"][number]>) => onChange({ ...value, groups: value.groups.map((g, j) => (j === i ? { ...g, ...p } : g)) });
  const setRow = (key: string, p: Partial<VariantDraft["rows"][string]>) =>
    onChange({ ...value, rows: { ...value.rows, [key]: { ...(value.rows[key] ?? { price: "", stock: "", enabled: true }), ...p } } });

  return (
    <div className="rounded-xl bg-white/[0.03] p-4">
      <div className="mb-1 text-[13px] font-semibold text-white">Options</div>
      <p className="mb-3 text-[12px] text-white/45">Sizes, colours, flavours… Each combination gets its own stock — and its own price if you like.</p>
      <div className="space-y-2">{value.groups.map((g, i) => (
        <div key={i} className="flex gap-2">
          <Input value={g.name} maxLength={30} placeholder={i === 0 ? "Size" : "Colour"} className="!w-32" onChange={(e) => setGroup(i, { name: e.target.value })} aria-label="Option name" />
          <Input value={g.values} placeholder={i === 0 ? "S, M, L, XL" : "Red, Black"} onChange={(e) => setGroup(i, { values: e.target.value })} aria-label="Values, separated by commas" />
          <button onClick={() => onChange({ ...value, groups: value.groups.filter((_, j) => j !== i) })} className="rounded-md px-2 text-white/40 hover:bg-white/10 hover:text-white" aria-label="Remove option"><Trash2 size={14} /></button>
        </div>
      ))}</div>
      {value.groups.length < 2 && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => onChange({ ...value, groups: [...value.groups, { name: "", values: "" }] })}>
          <Plus size={13} /> {value.groups.length ? "Add another option" : "Add options (size, colour…)"}
        </Button>
      )}
      {rows.length > 0 && (
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-[var(--surface)] text-left text-[11px] uppercase tracking-wide text-white/40">
              <tr><th className="px-3 py-2 font-medium">Variant</th><th className="font-medium">Price (₹)</th><th className="font-medium">Stock</th><th className="px-3 text-right font-medium">On</th></tr>
            </thead>
            <tbody>{rows.map((r) => {
              const row = value.rows[r.key] ?? { price: "", stock: "", enabled: true };
              return (
                <tr key={r.key} className="border-t border-white/[0.06]">
                  <td className="px-3 py-1.5 text-white">{r.title}</td>
                  <td className="py-1.5 pr-2"><Input value={row.price} inputMode="decimal" placeholder={basePrice || "same"} className="!h-8 !w-24" onChange={(e) => setRow(r.key, { price: e.target.value })} aria-label={`Price for ${r.title}`} /></td>
                  <td className="py-1.5 pr-2"><Input value={row.stock} inputMode="numeric" placeholder="∞" className="!h-8 !w-20" onChange={(e) => setRow(r.key, { stock: e.target.value.replace(/\D/g, "") })} aria-label={`Stock for ${r.title}`} /></td>
                  <td className="px-3 py-1.5 text-right"><Toggle checked={row.enabled} label={`Sell ${r.title}`} onChange={(v) => setRow(r.key, { enabled: v })} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && <p className="mt-2 text-[11.5px] text-white/40">Empty price = the product price. Empty stock = not tracked. 0 = sold out.</p>}
    </div>
  );
}
