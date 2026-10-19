"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, MessageCircle, Phone, Users } from "lucide-react";
import { Badge, Card, EmptyState, fmtDateTime, Select, Spinner, useUi } from "@/components/ui/kit";
import { errorMessage, shop as api, type BookingStatus, type ShopBooking } from "@/lib/api";

const FILTERS: { id: string; label: string; status?: BookingStatus }[] = [
  { id: "all", label: "All" }, { id: "pending", label: "Pending", status: "pending" }, { id: "confirmed", label: "Confirmed", status: "confirmed" },
  { id: "declined", label: "Declined", status: "declined" }, { id: "cancelled", label: "Cancelled", status: "cancelled" },
];
const TONE: Record<BookingStatus, "yellow" | "green" | "red" | "blue"> = { pending: "yellow", confirmed: "green", declined: "red", cancelled: "blue" };

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const when = (b: ShopBooking) => (b.kind === "stay" && b.check_out ? `${day(b.date)} → ${day(b.check_out)}` : `${day(b.date)}${b.time ? ` · ${b.time}` : ""}`);

/** Hotel / venue template: date-and-time booking requests from the storefront. The owner confirms or declines each one (usually after a call). */
export default function BookingsTab() {
  const { toast, confirm } = useUi();
  const [filter, setFilter] = useState("all");
  const [list, setList] = useState<ShopBooking[] | null>(null);
  useEffect(() => {
    let stale = false;
    api.bookings({ status: FILTERS.find((f) => f.id === filter)?.status, limit: 100 })
      .then((r) => { if (!stale) setList(r.items); })
      .catch((e) => { if (!stale) toast(errorMessage(e), "error"); });
    return () => { stale = true; };
  }, [filter, toast]);

  const setStatus = async (b: ShopBooking, status: BookingStatus) => {
    if (status === "declined" && !(await confirm({ title: `Decline booking #${b.number}?`, confirmLabel: "Decline", danger: true, body: "We won't message the customer. Call them to let them know." }))) return;
    try {
      const next = await api.updateBooking(b.id, status);
      setList((l) => l!.map((x) => (x.id === next.id ? next : x)));
    } catch (e) { toast(errorMessage(e), "error"); }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => { setFilter(f.id); setList(null); }} className={`rounded-full border px-3 py-1 text-[12.5px] ${filter === f.id ? "border-[var(--brand)] text-white" : "border-white/15 text-white/60 hover:text-white"}`}>{f.label}</button>
        ))}
      </div>
      {!list ? <Spinner /> : list.length === 0 ? (
        <EmptyState icon={<CalendarCheck size={22} />} title="No bookings here yet" body="When a customer taps Book now on a service and picks a date and time, the request shows up here and we email you." />
      ) : (
        <div className="space-y-3">{list.map((b) => (
          <Card key={b.id} className="p-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14.5px] font-semibold text-white">#{b.number} · {b.service_name}</span>
                  <Badge tone={TONE[b.status]}>{b.status[0].toUpperCase() + b.status.slice(1)}</Badge>
                  {b.event_type && <Badge tone="blue">{b.event_type}</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[13px] text-white/80">
                  <span className="inline-flex items-center gap-1.5"><CalendarCheck size={13} /> {when(b)}</span>
                  <span className="inline-flex items-center gap-1.5"><Users size={13} /> {b.guests} guest{b.guests === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-1 text-[12px] text-white/45">{b.customer_name} · +{b.customer_phone}{b.customer_email && ` · ${b.customer_email}`}</div>
                {b.note && <div className="mt-1 text-[12px] text-amber-200/80">Note: {b.note}</div>}
                <div className="mt-1 text-[11.5px] text-white/35">Requested {fmtDateTime(b.created_at)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Select value={b.status} onChange={(e) => setStatus(b, e.target.value as BookingStatus)} className="!w-36">
                  {(["pending", "confirmed", "declined", "cancelled"] as BookingStatus[]).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </Select>
                <div className="flex gap-1.5">
                  <a href={`tel:+${b.customer_phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[12px] text-white/70 hover:text-white"><Phone size={12} /> Call</a>
                  <a href={`https://wa.me/${b.customer_phone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[12px] text-white/70 hover:text-white"><MessageCircle size={12} /> WhatsApp</a>
                </div>
              </div>
            </div>
          </Card>
        ))}</div>
      )}
    </div>
  );
}
