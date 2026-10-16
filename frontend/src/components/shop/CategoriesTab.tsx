"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Pencil, Plus, Search, Shapes, Trash2 } from "lucide-react";
import { Alert, Button, Card, EmptyState, Field, Input, Modal, Spinner, useUi } from "@/components/ui/kit";
import PhotoUpload from "@/components/shop/PhotoUpload";
import { errorMessage, shop as api, type Product, type ShopCategory } from "@/lib/api";

/** The seller's categories: add one, give it a name (and a cover photo), and tick the products that belong in it. */
export default function CategoriesTab() {
  const { toast, confirm } = useUi();
  const [cats, setCats] = useState<ShopCategory[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<ShopCategory | "new" | null>(null);

  const load = useCallback(() => Promise.all([api.categories(), api.products()]).then(
    ([c, p]) => { setCats(c); setProducts(p); },
    (e) => { toast(errorMessage(e), "error"); setCats((x) => x ?? []); },
  ), [toast]);
  useEffect(() => { void load(); }, [load]);

  const coverOf = (c: ShopCategory) => c.image_url ?? products.find((p) => p.category.toLowerCase() === c.name.toLowerCase() && p.image_url)?.image_url ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={() => setEditing("new")}><Plus size={14} /> Add category</Button>
        <p className="text-[12px] text-white/40">Group your products — shoppers browse the store by category.</p>
      </div>
      {!cats ? <Spinner /> : cats.length === 0 ? (
        <EmptyState icon={<Shapes size={22} />} title="No categories yet" body="Add a category like “Sarees” or “Bags”, then pick the products that go in it." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{cats.map((c) => {
          const cover = coverOf(c);
          return (
            <Card key={c.id} className="overflow-hidden">
              <button onClick={() => setEditing(c)} className="block w-full text-left">
                <div className="aspect-[4/3] bg-white/[0.06]">
                  {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/25"><ImageIcon size={24} /></div>}
                </div>
                <div className="p-3">
                  <div className="truncate text-[13.5px] font-medium text-white">{c.name}</div>
                  <div className="text-[12px] text-white/45">{c.count} product{c.count === 1 ? "" : "s"}</div>
                </div>
              </button>
              <div className="flex justify-end gap-1 border-t border-white/10 px-2 py-1.5">
                <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(c)}><Pencil size={13} /></Button>
                <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => {
                  if (await confirm({ title: `Delete “${c.name}”?`, body: "The products stay in your store — they just won't be in any category.", confirmLabel: "Delete", danger: true })) {
                    try { await api.removeCategory(c.id); await load(); } catch (e) { toast(errorMessage(e), "error"); }
                  }
                }}><Trash2 size={13} /></Button>
              </div>
            </Card>
          );
        })}</div>
      )}
      {editing && <CategoryEditor category={editing === "new" ? null : editing} products={products} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); toast("Category saved"); void load(); }} />}
    </div>
  );
}

function CategoryEditor({ category, products, onClose, onSaved }: { category: ShopCategory | null; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [image, setImage] = useState(category?.image_url ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(category ? products.filter((p) => p.category.toLowerCase() === category.name.toLowerCase()).map((p) => p.id) : []));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const shown = useMemo(() => products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())), [products, q]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  const cover = image.trim();
  const problem = !name.trim() ? "Give the category a name." : cover && !/^https?:\/\/\S+$/.test(cover) ? "The cover photo must be a link starting with https://" : null;

  const save = async () => {
    setBusy(true); setErr(null);
    const body = { name: name.trim(), image_url: cover || null, product_ids: [...picked] };
    try { if (category) await api.updateCategory(category.id, body); else await api.createCategory(body); onSaved(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={category ? "Edit category" : "Add category"}
      footer={<><span className="mr-auto text-[12px] text-amber-200/80">{problem ?? `${picked.size} product${picked.size === 1 ? "" : "s"} selected`}</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!!problem} onClick={save}>Save</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="space-y-3">
        <Field label="Category name"><Input value={name} maxLength={60} placeholder="e.g. Sarees" autoFocus onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Cover photo (optional)" hint="Shown on the storefront. Left empty, the first product's photo is used.">
          <div className="flex items-center gap-3">
            {cover && /^https?:\/\/\S+$/.test(cover) && <img src={cover} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
            <Input value={image} placeholder="https://…" onChange={(e) => setImage(e.target.value)} />
            <PhotoUpload onUploaded={([u]) => setImage(u)} />
          </div>
        </Field>
        <Field label="Products in this category">
          {products.length === 0 ? <p className="text-[13px] text-white/45">Add some products first, then come back to put them in a category.</p> : (
            <>
              <div className="relative mb-2">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <Input value={q} placeholder="Search products" className="!pl-9" onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="mb-2 flex gap-3 text-[12px] text-white/55">
                <button type="button" className="hover:text-white" onClick={() => setPicked(new Set([...picked, ...shown.map((p) => p.id)]))}>Select shown</button>
                <button type="button" className="hover:text-white" onClick={() => setPicked(new Set())}>Clear</button>
              </div>
              <div className="max-h-72 divide-y divide-white/10 overflow-y-auto rounded-xl border border-white/10">
                {shown.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-white/45">No products match “{q}”.</div>}
                {shown.map((p) => {
                  const other = p.category && p.category.toLowerCase() !== name.trim().toLowerCase() && p.category.toLowerCase() !== (category?.name ?? "").toLowerCase() ? p.category : null;
                  return (
                    <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/[0.04]">
                      <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[var(--brand)]" />
                      {p.image_url ? <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-md bg-white/[0.06]" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-white">{p.name}</span>
                        {other && <span className="block truncate text-[11.5px] text-white/40">Currently in {other} — selecting moves it here</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </Field>
      </div>
    </Modal>
  );
}
