"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, CheckCircle2, ExternalLink, FileText, Image as ImageIcon, Instagram, MessageCircleReply, Package, Plus, ShoppingBag, Store, Trash2, Truck } from "lucide-react";
import {
  Alert, Badge, Button, Card, CopyField, EmptyState, Field, fmtDateTime, Input, Modal, Page, PageHeader, Select, Spinner, Stat, Tabs, Textarea, Toggle, useUi,
} from "@/components/ui/kit";
import MediaPicker from "@/components/dashboard/MediaPicker";
import ShipModal from "@/components/shop/ShipModal";
import ShippingSettings from "@/components/shop/ShippingSettings";
import ShopReports from "@/components/shop/ShopReports";
import VariantsEditor, { draftFrom, toInput, type VariantDraft } from "@/components/shop/VariantsEditor";
import {
  errorMessage, instagram, itemLabel, shop as api, type IgAccount, type OrderStatus, type Product, type ProductInput, type ShiprocketStatus, type ShopInput, type ShopOrder,
  type ShopOverview,
} from "@/lib/api";
import { fmtMoney, fromMinor, toMinor } from "@/lib/money";

type Tab = "orders" | "products" | "reports" | "settings";

export default function ShopPage() {
  const [overview, setOverview] = useState<ShopOverview | null>(null);
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [tab, setTab] = useState<Tab>("orders");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => { try { setOverview(await api.get()); } catch (e) { setError(errorMessage(e, "Couldn't load your store.")); } }, []);
  useEffect(() => { void load(); instagram.list().then((a) => setAccounts(a.filter((x) => x.status !== "disconnected"))).catch(() => {}); }, [load]);

  if (!overview) return <Page>{error ? <Alert>{error}</Alert> : <Spinner />}</Page>;
  const { shop, stats, payments } = overview;
  return (
    <Page wide>
      <PageHeader icon={<Store size={20} />} title="Instagram Shop"
        subtitle="A store for your Instagram — no website needed. People comment, tap Buy in the DM, and pay by UPI or cash on delivery."
        actions={shop && <a href={shop.url} target="_blank" rel="noreferrer"><Button variant="ghost"><ExternalLink size={14} /> View store</Button></a>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

      {!shop ? (
        <Card className="mx-auto max-w-2xl p-6">
          <div className="mb-4 flex items-center gap-2 text-[16px] font-semibold text-white"><ShoppingBag size={18} /> Set up your store</div>
          <StoreSettings shop={null} accounts={accounts} onSaved={() => { void load(); setTab("products"); }} />
        </Card>
      ) : (
        <>
          {shop.online_payments && !payments.connected && (
            <Alert tone="yellow">Connect your Razorpay account to take UPI and card payments — money goes straight to you.{" "}
              <Link href="/dashboard/settings?tab=payments" className="underline">Connect Razorpay</Link>{shop.cod_enabled ? " (cash on delivery works meanwhile)." : "."}</Alert>
          )}
          {payments.test_mode && <Alert tone="blue">Razorpay is in test mode — payments are not real until you connect live keys.</Alert>}
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sales" value={fmtMoney(stats.revenue)} sub={`${stats.orders} order${stats.orders === 1 ? "" : "s"}`} />
            <Stat label="From comments" value={fmtMoney(stats.comment_revenue)} sub={`${stats.comment_orders} order${stats.comment_orders === 1 ? "" : "s"} via Comment → DM`} />
            <Stat label="Recovered by reminders" value={fmtMoney(stats.recovered_revenue)} sub={`${stats.recovered_orders} order${stats.recovered_orders === 1 ? "" : "s"} that would have been lost`} />
            <Stat label="To ship" value={stats.to_ship} sub={`${stats.awaiting_payment ? `${stats.awaiting_payment} awaiting payment · ` : ""}${stats.views.toLocaleString()} store visits`} />
          </div>
          <div className="mb-5"><CopyField label="Your store link — put it in your Instagram bio" value={shop.url} /></div>
          <Tabs tabs={[{ id: "orders", label: "Orders", count: stats.to_ship || undefined }, { id: "products", label: "Products" }, { id: "reports", label: "Reports" },
            { id: "settings", label: "Store settings" }]} value={tab} onChange={setTab} />
          {tab === "orders" && <Orders onChange={load} />}
          {tab === "products" && <Products accounts={accounts} />}
          {tab === "reports" && <ShopReports />}
          {tab === "settings" && (
            <div className="grid max-w-5xl gap-4 lg:grid-cols-[1.3fr_1fr]">
              <Card className="p-6"><StoreSettings shop={shop} accounts={accounts} onSaved={load} /></Card>
              <Card className="h-fit p-6"><ShippingSettings /></Card>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

// ---- orders ---------------------------------------------------------------------------------------------------------------------------------

const FILTERS: { id: string; label: string; q: { status?: string; payment?: string } }[] = [
  { id: "all", label: "All orders", q: {} }, { id: "confirmed", label: "To ship", q: { status: "confirmed" } }, { id: "pending", label: "Awaiting payment", q: { payment: "pending" } },
  { id: "shipped", label: "Shipped", q: { status: "shipped" } }, { id: "delivered", label: "Delivered", q: { status: "delivered" } },
  { id: "returned", label: "Returned", q: { status: "returned" } }, { id: "cancelled", label: "Cancelled", q: { status: "cancelled" } },
];
const PAYMENT: Record<ShopOrder["payment_status"], { label: string; tone: "green" | "yellow" | "red" | "blue" }> = {
  paid: { label: "Paid", tone: "green" }, cod: { label: "COD", tone: "blue" }, pending: { label: "Awaiting payment", tone: "yellow" }, failed: { label: "Failed", tone: "red" },
};

function Orders({ onChange }: { onChange: () => void }) {
  const { toast, confirm } = useUi();
  const [filter, setFilter] = useState("all");
  const [orders, setOrders] = useState<ShopOrder[] | null>(null);
  const [shipping, setShipping] = useState<ShopOrder | null>(null);
  const [shiprocket, setShiprocket] = useState<ShiprocketStatus | null>(null);
  useEffect(() => { api.shiprocket().then(setShiprocket, () => setShiprocket({ connected: false })); }, []);
  const replace = (next: ShopOrder) => setOrders((l) => l!.map((x) => (x.id === next.id ? next : x)));
  const load = useCallback(async () => {
    try { setOrders((await api.orders({ ...FILTERS.find((f) => f.id === filter)!.q, limit: 100 })).items); } catch (e) { toast(errorMessage(e), "error"); }
  }, [filter, toast]);
  useEffect(() => { setOrders(null); void load(); }, [load]);

  const update = async (o: ShopOrder, b: { status?: OrderStatus; mark_paid?: boolean }) => {
    if (b.status === "cancelled" && !(await confirm({
      title: `Cancel order #${o.number}?`, confirmLabel: "Cancel order", danger: true,
      body: o.payment_status === "paid" && o.payment_method === "online" ? "The stock is released. The customer has already paid — refund them from your Razorpay dashboard." : "The stock is released.",
    }))) return;
    try { replace(await api.updateOrder(o.id, b)); onChange(); } catch (e) { toast(errorMessage(e), "error"); }
  };
  const canShip = (o: ShopOrder) => (o.status === "confirmed" || (o.status === "new" && o.cod_confirmation === "asked")) && o.payment_status !== "pending";

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-full border px-3 py-1 text-[12.5px] ${filter === f.id ? "border-[var(--brand)] text-white" : "border-white/15 text-white/60 hover:text-white"}`}>{f.label}</button>
        ))}
      </div>
      {!orders ? <Spinner /> : orders.length === 0 ? (
        <EmptyState icon={<Package size={22} />} title="No orders here yet" body="Share your store link, or link a product to a Comment → DM automation so commenters can buy straight from the DM." />
      ) : (
        <div className="space-y-3">{orders.map((o) => (
          <Card key={o.id} className="p-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex -space-x-2">{o.items.slice(0, 3).map((it) => it.image_url
                ? <img key={it.product_id} src={it.image_url} alt="" className="h-12 w-12 rounded-lg border-2 border-[var(--background)] object-cover" />
                : <div key={it.product_id} className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/[0.06] text-white/30"><ImageIcon size={16} /></div>)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14.5px] font-semibold text-white">#{o.number} · {fmtMoney(o.total)}</span>
                  <Badge tone={PAYMENT[o.payment_status].tone}>{PAYMENT[o.payment_status].label}</Badge>
                  {o.source !== "store" && <Badge tone="blue"><MessageCircleReply size={10} /> {o.source === "chat" ? "Ordered in chat" : o.automation?.name ?? "Comment → DM"}</Badge>}
                  {o.cod_confirmation === "asked" && <Badge tone="yellow">COD not confirmed yet</Badge>}
                  {o.cod_confirmation === "declined" && <Badge tone="red">Buyer cancelled</Badge>}
                  {o.recovered && <Badge tone="green">Recovered by reminder</Badge>}
                </div>
                <div className="mt-0.5 text-[12.5px] text-white/70">{o.items.map((it) => `${itemLabel(it)} × ${it.qty}`).join(", ")}</div>
                <div className="mt-1 text-[12px] text-white/45">
                  {o.customer_name} · +{o.customer_phone} · {[o.address.line1, o.address.line2, o.address.city, o.address.state, o.address.pincode].filter(Boolean).join(", ")}
                </div>
                {o.note && <div className="mt-1 text-[12px] text-amber-200/80">Note: {o.note}</div>}
                {(o.awb || o.courier) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-sky-200/90">
                    <Truck size={12} /> {o.courier ?? "Courier"}{o.awb && ` · AWB ${o.awb}`}{o.courier_status && ` · ${o.courier_status.toLowerCase()}`}
                    {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" className="underline">track</a>}
                  </div>
                )}
                <div className="mt-1 text-[11.5px] text-white/35">{fmtDateTime(o.created_at)}{o.customer_email && ` · ${o.customer_email}`}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Select value={o.status} onChange={(e) => update(o, { status: e.target.value as OrderStatus })} className="!w-36" disabled={o.payment_status === "pending"}>
                  {(["new", "confirmed", "shipped", "delivered", "returned", "cancelled"] as OrderStatus[]).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </Select>
                {canShip(o) && <Button size="sm" onClick={() => setShipping(o)}><Truck size={13} /> Ship</Button>}
                {o.status === "shipped" && <Button size="sm" variant="ghost" onClick={() => update(o, { status: "delivered" })}><CheckCircle2 size={13} /> Mark delivered</Button>}
                {o.payment_method === "cod" && o.payment_status === "cod" && o.status !== "delivered" && <Button size="sm" variant="ghost" onClick={() => update(o, { mark_paid: true })}><Banknote size={13} /> Cash received</Button>}
                {o.invoice_url && <a href={o.invoice_url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><FileText size={13} /> Invoice</Button></a>}
              </div>
            </div>
          </Card>
        ))}</div>
      )}
      {shipping && <ShipModal order={shipping} shiprocket={shiprocket} onClose={() => setShipping(null)}
        onShipped={(o, note) => { replace(o); if (!note) { setShipping(null); toast(`Order #${o.number} shipped 🚚`); } onChange(); }} />}
    </div>
  );
}

// ---- products -------------------------------------------------------------------------------------------------------------------------------

function Products({ accounts }: { accounts: IgAccount[] }) {
  const { toast, confirm } = useUi();
  const [list, setList] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const load = useCallback(async () => { try { setList(await api.products()); } catch (e) { toast(errorMessage(e), "error"); } }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const account = accounts[0];
  const importPosts = async (ids: string[]) => {
    setPicking(false); setImporting(true);
    try {
      const r = await api.importPosts(account.id, ids);
      const needPrice = r.created.filter((p) => p.status === "hidden").length;
      toast(`${r.created.length} product${r.created.length === 1 ? "" : "s"} added${needPrice ? ` — ${needPrice} need a price` : ""}${r.skipped ? ` (${r.skipped} already in your store)` : ""}`);
      await load();
    } catch (e) { toast(errorMessage(e), "error"); } finally { setImporting(false); }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {account && <Button onClick={() => setPicking(true)} loading={importing}><Instagram size={14} /> Import from Instagram posts</Button>}
        <Button variant="ghost" onClick={() => setEditing("new")}><Plus size={14} /> Add product</Button>
      </div>
      {account && <p className="-mt-2 mb-4 text-[12px] text-white/40">Pick your product posts — the name, description and price (₹499, Rs 499, 499/-) are read from the caption.</p>}
      {!list ? <Spinner /> : list.length === 0 ? (
        <EmptyState icon={<ShoppingBag size={22} />} title="No products yet" body="Import your product posts from Instagram in one click, or add a product by hand." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{list.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <button onClick={() => setEditing(p)} className="block w-full text-left">
              <div className="relative aspect-square bg-white/[0.06]">
                {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/25"><ImageIcon size={24} /></div>}
                {p.status === "hidden" && <span className="absolute left-2 top-2"><Badge tone={p.price < 100 ? "yellow" : "gray"}>{p.price < 100 ? "Add a price" : "Hidden"}</Badge></span>}
                {p.stock === 0 && <span className="absolute right-2 top-2"><Badge tone="red">Sold out</Badge></span>}
              </div>
              <div className="p-3">
                <div className="truncate text-[13.5px] font-medium text-white">{p.name}</div>
                <div className="mt-0.5 flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-white">{p.price >= 100 ? fmtMoney(p.price) : "—"}</span>
                  <span className="text-white/45">{p.orders_count} sold{p.stock !== null ? ` · ${p.stock} left` : ""}</span>
                </div>
              </div>
            </button>
            <div className="flex justify-end border-t border-white/10 px-2 py-1.5">
              <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => {
                if (await confirm({ title: `Delete “${p.name}”?`, body: "Past orders keep their details. Comment automations selling it stop showing the Buy button.", confirmLabel: "Delete", danger: true })) {
                  try { await api.removeProduct(p.id); await load(); } catch (e) { toast(errorMessage(e), "error"); }
                }
              }}><Trash2 size={13} /></Button>
            </div>
          </Card>
        ))}</div>
      )}
      {picking && account && <MediaPicker account={account} selected={[]} onClose={() => setPicking(false)} onDone={(sel) => importPosts(sel.map((m) => m.id))} />}
      {editing && <ProductEditor product={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Product saved"); void load(); }} />}
    </div>
  );
}

function ProductEditor({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: product?.name ?? "", description: product?.description ?? "", price: product && product.price >= 100 ? fromMinor(product.price) : "",
    mrp: product?.compare_at_price ? fromMinor(product.compare_at_price) : "", image_url: product?.image_url ?? "", visible: product ? product.status === "active" : true,
    track: product ? product.stock !== null : false, stock: String(product?.stock ?? 10),
  });
  const [draft, setDraft] = useState<VariantDraft>(() => draftFrom(product));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const price = toMinor(f.price);
  const mrp = f.mrp.trim() ? toMinor(f.mrp) : null;
  const variants = toInput(draft);
  const hasVariants = variants.variants.length > 0;
  const problem = !f.name.trim() ? "Give the product a name." : price === null || price < 100 ? "Enter a price of at least ₹1." : f.mrp.trim() && mrp === null ? "The MRP isn't a valid amount."
    : f.image_url.trim() && !/^https?:\/\/\S+$/.test(f.image_url.trim()) ? "The photo must be a link starting with https://" : variants.problem;

  const save = async () => {
    setBusy(true); setErr(null);
    const body: ProductInput = { name: f.name.trim(), description: f.description.trim(), price: price!, compare_at_price: mrp, image_url: f.image_url.trim() || null,
      status: f.visible ? "active" : "hidden", stock: f.track && !hasVariants ? Math.max(0, parseInt(f.stock, 10) || 0) : null, sort: product?.sort ?? 0,
      options: variants.options, variants: variants.variants };
    try { if (product) await api.updateProduct(product.id, body); else await api.createProduct(body); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={product ? "Edit product" : "Add product"}
      footer={<><span className="mr-auto text-[12px] text-amber-200/80">{problem ?? ""}</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!!problem} onClick={save}>Save</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="space-y-3">
        <div className="flex gap-4">
          {f.image_url.trim() ? <img src={f.image_url} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" /> : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/25"><ImageIcon size={22} /></div>}
          <div className="flex-1 space-y-3">
            <Field label="Name"><Input value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
            <Field label="Photo link"><Input value={f.image_url} placeholder="https://…" onChange={(e) => setF({ ...f, image_url: e.target.value })} /></Field>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price (₹)"><Input value={f.price} inputMode="decimal" placeholder="499" onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="MRP (₹, optional)" hint="Shown struck through, with the discount"><Input value={f.mrp} inputMode="decimal" placeholder="799" onChange={(e) => setF({ ...f, mrp: e.target.value })} /></Field>
        </div>
        <Field label="Description"><Textarea rows={4} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <VariantsEditor value={draft} onChange={setDraft} basePrice={f.price} />
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-[13px] text-white/75"><Toggle checked={f.visible} label="Visible" onChange={(v) => setF({ ...f, visible: v })} /> Show in store</label>
          {!hasVariants && <label className="flex items-center gap-2 text-[13px] text-white/75"><Toggle checked={f.track} label="Track stock" onChange={(v) => setF({ ...f, track: v })} /> Track stock</label>}
          {!hasVariants && f.track && <Input type="number" min={0} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className="!w-24" aria-label="Stock" />}
        </div>
      </div>
    </Modal>
  );
}

// ---- settings -------------------------------------------------------------------------------------------------------------------------------

function StoreSettings({ shop, accounts, onSaved }: { shop: ShopOverview["shop"]; accounts: IgAccount[]; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<ShopInput>(() => shop ? {
    slug: shop.slug, name: shop.name, tagline: shop.tagline, account_id: shop.account_id, logo_url: shop.logo_url, published: shop.published, online_payments: shop.online_payments,
    cod_enabled: shop.cod_enabled, shipping_fee: shop.shipping_fee, free_shipping_above: shop.free_shipping_above, support_phone: shop.support_phone, confirmation_message: shop.confirmation_message,
    chat_orders: shop.chat_orders, cod_confirmation: shop.cod_confirmation, reminders_enabled: shop.reminders_enabled, reminder_after_minutes: shop.reminder_after_minutes,
    reminder_message: shop.reminder_message, gstin: shop.gstin, legal_name: shop.legal_name, business_address: shop.business_address, gst_rate: shop.gst_rate,
  } : {
    slug: (accounts[0]?.username ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40), name: accounts[0]?.name ?? "", tagline: "",
    account_id: accounts[0]?.id ?? null, logo_url: null, published: true, online_payments: true, cod_enabled: false, shipping_fee: 0, free_shipping_above: null,
    support_phone: "", confirmation_message: "", chat_orders: true, cod_confirmation: true, reminders_enabled: true, reminder_after_minutes: 60, reminder_message: "",
    gstin: "", legal_name: "", business_address: "", gst_rate: 0,
  });
  const [fee, setFee] = useState(f.shipping_fee ? fromMinor(f.shipping_fee) : "");
  const [freeAbove, setFreeAbove] = useState(f.free_shipping_above !== null ? fromMinor(f.free_shipping_above) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<ShopInput>) => setF((x) => ({ ...x, ...p }));
  const problem = !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(f.slug) ? "The store address needs 3–40 lowercase letters, numbers or dashes." : !f.name.trim() ? "Name your store."
    : !f.online_payments && !f.cod_enabled ? "Turn on online payments, cash on delivery, or both." : fee.trim() && toMinor(fee) === null ? "The delivery fee isn't a valid amount." : null;

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.save({ ...f, shipping_fee: toMinor(fee) ?? 0, free_shipping_above: freeAbove.trim() ? toMinor(freeAbove) : null });
      toast(shop ? "Store saved" : "Your store is live 🎉"); onSaved();
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {err && <Alert>{err}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Store name"><Input value={f.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} placeholder="Priya's Bakery" /></Field>
        <Field label="Store address" hint={`${typeof window !== "undefined" ? window.location.origin : ""}/s/${f.slug || "your-store"}`}>
          <Input value={f.slug} maxLength={40} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
        </Field>
      </div>
      <Field label="Tagline (optional)"><Input value={f.tagline} maxLength={300} onChange={(e) => set({ tagline: e.target.value })} placeholder="Fresh eggless cakes · Pune · Same-day delivery" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Instagram account" hint="Order confirmations are DMed from it"><Select value={f.account_id ?? ""} onChange={(e) => set({ account_id: e.target.value || null })}>
          <option value="">None</option>{accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
        </Select></Field>
        <Field label="Support phone / WhatsApp (optional)"><Input value={f.support_phone} maxLength={32} onChange={(e) => set({ support_phone: e.target.value })} placeholder="+91 98765 43210" /></Field>
      </div>
      <div className="rounded-xl bg-white/[0.03] p-4">
        <div className="mb-2 text-[13px] font-semibold text-white">Payments</div>
        <label className="flex items-center gap-2 text-[13px] text-white/75"><Toggle checked={f.online_payments} label="Online" onChange={(v) => set({ online_payments: v })} /> UPI, cards &amp; netbanking (your Razorpay account)</label>
        <label className="mt-2 flex items-center gap-2 text-[13px] text-white/75"><Toggle checked={f.cod_enabled} label="COD" onChange={(v) => set({ cod_enabled: v })} /> Cash on delivery</label>
        {f.cod_enabled && (
          <label className="ml-12 mt-2 flex items-center gap-2 text-[12.5px] text-white/65"><Toggle checked={f.cod_confirmation} label="Confirm COD" onChange={(v) => set({ cod_confirmation: v })} />
            Ask Instagram buyers to confirm COD orders in a DM (fewer parcels returned)</label>
        )}
      </div>
      <div className="rounded-xl bg-white/[0.03] p-4">
        <div className="mb-2 text-[13px] font-semibold text-white">Selling in DMs</div>
        <label className="flex items-center gap-2 text-[13px] text-white/75"><Toggle checked={f.chat_orders} label="Order in chat" onChange={(v) => set({ chat_orders: v })} />
          Let buyers order right in the chat — they send their address, you get the order</label>
        <label className="mt-2 flex items-center gap-2 text-[13px] text-white/75"><Toggle checked={f.reminders_enabled} label="Reminders" onChange={(v) => set({ reminders_enabled: v })} />
          Remind people who tapped Buy but didn&apos;t order, or didn&apos;t finish paying</label>
        {f.reminders_enabled && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[150px_1fr]">
            <Field label="After (minutes)"><Input type="number" min={10} max={1200} value={f.reminder_after_minutes}
              onChange={(e) => set({ reminder_after_minutes: Math.max(10, Math.min(1200, Number(e.target.value) || 60)) })} /></Field>
            <Field label="Reminder" hint="Sent once, only within Instagram's 24-hour reply window. {{product}} and {{name}} are filled in.">
              <Input value={f.reminder_message} maxLength={640} placeholder={shop?.default_reminder_message ?? "Still thinking about {{product}}? 👀 Tap below to grab yours before it's gone."}
                onChange={(e) => set({ reminder_message: e.target.value })} />
            </Field>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Delivery fee (₹)" hint="Leave empty for free delivery"><Input value={fee} inputMode="decimal" placeholder="50" onChange={(e) => setFee(e.target.value)} /></Field>
        <Field label="Free delivery above (₹, optional)"><Input value={freeAbove} inputMode="decimal" placeholder="999" onChange={(e) => setFreeAbove(e.target.value)} /></Field>
      </div>
      <Field label="Order confirmation DM" hint="Sent on Instagram once an order is paid or placed as COD. {{name}}, {{order}}, {{total}} and {{link}} are filled in.">
        <Textarea rows={3} maxLength={900} value={f.confirmation_message} placeholder={shop?.default_confirmation_message ?? "Thank you {{name}}! 🎉 Your order #{{order}} for {{total}} is confirmed."}
          onChange={(e) => set({ confirmation_message: e.target.value })} />
      </Field>
      <div className="rounded-xl bg-white/[0.03] p-4">
        <div className="mb-1 text-[13px] font-semibold text-white">Invoices &amp; GST</div>
        <p className="mb-3 text-[12px] text-white/45">Every confirmed order gets an invoice your buyer can download. With a GSTIN it&apos;s a tax invoice (your prices include GST); without one it&apos;s a simple bill.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field label="GSTIN (optional)"><Input value={f.gstin} maxLength={15} placeholder="27ABCDE1234F1Z5" onChange={(e) => set({ gstin: e.target.value.toUpperCase().replace(/\s/g, "") })} /></Field>
          <Field label="GST rate"><Select value={f.gst_rate} onChange={(e) => set({ gst_rate: Number(e.target.value) as ShopInput["gst_rate"] })} disabled={!f.gstin}>
            {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
          </Select></Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Legal / business name"><Input value={f.legal_name} maxLength={200} placeholder={f.name || "As on your GST certificate"} onChange={(e) => set({ legal_name: e.target.value })} /></Field>
          <Field label="Business address"><Input value={f.business_address} maxLength={500} placeholder="Shown on invoices" onChange={(e) => set({ business_address: e.target.value })} /></Field>
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-white/75"><Toggle checked={f.published} label="Published" onChange={(v) => set({ published: v })} /> Store is open (turn off to hide it)</label>
      <div className="flex items-center justify-end gap-3">
        <span className="mr-auto text-[12px] text-amber-200/80">{problem ?? ""}</span>
        <Button loading={busy} disabled={!!problem} onClick={save}>{shop ? "Save" : "Create my store"}</Button>
      </div>
    </div>
  );
}
