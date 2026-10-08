"use client";

import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { Alert, Badge, Button, CopyField, Field, Input, Select, Spinner, useUi } from "@/components/ui/kit";
import { errorMessage, shop as api, type ShiprocketStatus } from "@/lib/api";

/** Connect the seller's own Shiprocket account (an API user) and show the webhook they paste back into Shiprocket. */
export default function ShippingSettings() {
  const { toast, confirm } = useUi();
  const [st, setSt] = useState<ShiprocketStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pickup, setPickup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.shiprocket().then((s) => { setSt(s); if (s.connected) { setEmail(s.email); setPickup(s.pickup_location); } }).catch((e) => setErr(errorMessage(e)));
  }, []);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const s = await api.connectShiprocket({ email: email.trim(), password, pickup_location: pickup });
      setSt(s); setPassword(""); if (s.connected) setPickup(s.pickup_location);
      toast("Shiprocket connected");
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!(await confirm({ title: "Disconnect Shiprocket?", body: "Orders already shipped keep their tracking. New orders can still be shipped with another courier.", confirmLabel: "Disconnect", danger: true }))) return;
    try { await api.disconnectShiprocket(); setSt({ connected: false }); setPassword(""); } catch (e) { toast(errorMessage(e), "error"); }
  };

  if (!st) return err ? <Alert>{err}</Alert> : <Spinner />;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-white"><Truck size={15} /> Shiprocket {st.connected ? <Badge tone="green">connected</Badge> : <Badge>not connected</Badge>}</div>
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      {!st.connected && (
        <p className="text-[12.5px] text-white/55">Book couriers for your orders in one click and get tracking back automatically. In Shiprocket go to <b>Settings → API → Configure → Create an API user</b> and use that email and password here.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="API user email"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="api@yourstore.com" /></Field>
        <Field label="API user password" hint={st.connected ? "Leave empty to keep the saved one" : undefined}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
      </div>
      {st.connected && (
        <Field label="Ship from (pickup address)"><Select value={pickup ?? ""} onChange={(e) => setPickup(e.target.value)}>{st.pickup_locations.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
      )}
      <div className="flex gap-2">
        <Button loading={busy} disabled={!email.trim() || (!st.connected && !password)} onClick={save}>{st.connected ? "Save" : "Connect Shiprocket"}</Button>
        {st.connected && <Button variant="ghost" onClick={disconnect}>Disconnect</Button>}
      </div>
      {st.connected && (
        <div className="space-y-2 rounded-lg bg-white/[0.03] p-3">
          <p className="text-[12px] text-white/55">For live tracking updates: Shiprocket → Settings → API → Webhooks → add this URL and token.</p>
          <CopyField label="Webhook URL" value={st.webhook_url} />
          <CopyField label="Token (x-api-key)" value={st.webhook_key} />
          {st.last_error && <p className="text-[12px] text-amber-200/80">Last Shiprocket message: {st.last_error}</p>}
        </div>
      )}
    </div>
  );
}
