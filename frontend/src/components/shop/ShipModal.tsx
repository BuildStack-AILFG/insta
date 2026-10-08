"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { Alert, Button, Field, Input, Modal, Tabs } from "@/components/ui/kit";
import { errorMessage, shop as api, type ShiprocketStatus, type ShopOrder } from "@/lib/api";

/** Ship an order: push it to Shiprocket (courier + AWB assigned there), or record a courier and AWB you got yourself. */
export default function ShipModal({ order, shiprocket, onClose, onShipped }: {
  order: ShopOrder; shiprocket: ShiprocketStatus | null; onClose: () => void; onShipped: (o: ShopOrder, note?: string) => void;
}) {
  const connected = !!shiprocket?.connected;
  const [tab, setTab] = useState<"shiprocket" | "manual">(connected ? "shiprocket" : "manual");
  const [city, setCity] = useState(order.address.city ?? "");
  const [state, setState] = useState(order.address.state ?? "");
  const [weight, setWeight] = useState(String(shiprocket?.connected ? shiprocket.package.weight_kg : 0.5));
  const [courier, setCourier] = useState(order.courier ?? "");
  const [awb, setAwb] = useState(order.awb ?? "");
  const [url, setUrl] = useState(order.tracking_url ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const viaShiprocket = async () => {
    setBusy(true); setErr(null);
    try {
      const pkg = shiprocket?.connected ? { ...shiprocket.package, weight_kg: Number(weight) || shiprocket.package.weight_kg } : undefined;
      const r = await api.shipWithShiprocket(order.id, { city: city.trim() || undefined, state: state.trim() || undefined, package: pkg });
      if (r.shipped) onShipped(r.order); else { setErr(r.message); onShipped(r.order, r.message ?? undefined); }
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const manually = async () => {
    setBusy(true); setErr(null);
    try { onShipped(await api.ship(order.id, { courier: courier.trim(), awb: awb.trim(), tracking_url: url.trim() || null })); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const urlBad = !!url.trim() && !/^https?:\/\/\S+$/.test(url.trim());

  return (
    <Modal open onClose={onClose} title={`Ship order #${order.number}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        {tab === "shiprocket"
          ? <Button loading={busy} disabled={!connected} onClick={viaShiprocket}><Truck size={14} /> {order.shiprocket_shipment_id ? "Assign courier" : "Ship with Shiprocket"}</Button>
          : <Button loading={busy} disabled={urlBad} onClick={manually}><Truck size={14} /> Mark shipped</Button>}</>}>
      {err && <Alert>{err}</Alert>}
      <Tabs tabs={[{ id: "shiprocket", label: "Shiprocket" }, { id: "manual", label: "Other courier" }]} value={tab} onChange={setTab} />
      {tab === "shiprocket" ? (
        connected ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-white/55">Creates the order in your Shiprocket account (pickup: <b>{shiprocket.pickup_location}</b>), assigns the best courier and books the AWB. Tracking updates come back automatically.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pune" /></Field>
              <Field label="State"><Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Maharashtra" /></Field>
              <Field label="Weight (kg)"><Input value={weight} inputMode="decimal" onChange={(e) => setWeight(e.target.value)} /></Field>
            </div>
            <p className="text-[12px] text-white/40">Delivering to {[order.address.line1, order.address.line2, order.address.pincode].filter(Boolean).join(", ")} · {order.payment_method === "cod" && order.payment_status !== "paid" ? "COD" : "Prepaid"}</p>
          </div>
        ) : <p className="text-[13px] text-white/60">Connect Shiprocket in <b>Store settings → Shipping</b> to book couriers in one click. Or use “Other courier”.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Courier"><Input value={courier} maxLength={80} onChange={(e) => setCourier(e.target.value)} placeholder="Delhivery, DTDC, India Post…" /></Field>
            <Field label="AWB / tracking number"><Input value={awb} maxLength={64} onChange={(e) => setAwb(e.target.value)} /></Field>
          </div>
          <Field label="Tracking link (optional)" error={urlBad ? "Must start with https://" : null}><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></Field>
        </div>
      )}
      <p className="mt-3 text-[11.5px] text-white/40">The buyer gets an Instagram DM with the tracking link if they messaged you in the last 24 hours (Instagram&apos;s rule). They can always DM “track” to get it, and it&apos;s on their order page.</p>
    </Modal>
  );
}
