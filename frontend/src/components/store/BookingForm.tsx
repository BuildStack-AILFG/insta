"use client";

import { useState } from "react";
import { CalendarCheck, Check, Loader2, MessageCircle, Phone, X } from "lucide-react";
import { errorMessage, storefront, type BookingInput, type PublicProduct, type PublicStore } from "@/lib/api";
import { isDemoSlug } from "@/lib/store/demos";

const SAVED = "gfg_buyer"; // same device memory as the checkout form
const field = "w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-[14px] text-[var(--fg)] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:outline-none";
const label = "mb-1 block text-[12.5px] font-medium text-[var(--muted)]";
const SLOTS = [["Morning", "6 am – 12 pm"], ["Afternoon", "12 – 5 pm"], ["Evening", "5 – 9 pm"], ["Night", "9 pm onwards"]] as const;
const EVENTS = ["Wedding", "Reception", "Engagement", "Birthday party", "Corporate event", "Other"];

/** Rooms and suites are booked by check-in / check-out; everything else by a day and a time. Mirrors backend services/shop.py is_stay. */
export const isStay = (p: PublicProduct) => /room|suite/i.test(p.category);

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const readSaved = (): { name: string; phone: string; email: string } => {
  try { return { name: "", phone: "", email: "", ...JSON.parse(window.localStorage.getItem(SAVED) ?? "{}") }; } catch { return { name: "", phone: "", email: "" }; }
};

/** The "Book now" dialog on a hotel / venue service page: pick a date and time (or check-in / check-out for a room) and send a request the owner confirms. */
export default function BookingForm({ store, product, onClose }: { store: PublicStore; product: PublicProduct; onClose: () => void }) {
  const stay = isStay(product);
  const today = iso(new Date());
  const [saved] = useState(readSaved);
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [date, setDate] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [slot, setSlot] = useState("");
  const [exact, setExact] = useState("");
  const [guests, setGuests] = useState(stay ? "2" : "100");
  const [eventType, setEventType] = useState(stay ? "" : EVENTS[0]);
  const [note, setNote] = useState("");
  const [trap, setTrap] = useState(""); // honeypot, hidden from people
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const time = exact || slot;
  const guestsN = Number(guests);
  const problem = !name.trim() ? "Enter your name"
    : phone.replace(/\D/g, "").length < 10 ? "Enter your 10-digit mobile number"
    : !date ? (stay ? "Choose your check-in date" : "Choose the event date")
    : date < today ? "Choose a date from today onwards"
    : stay && (!checkOut || checkOut <= date) ? "Check-out must be after check-in"
    : !stay && !time ? "Choose a time for your event"
    : !Number.isInteger(guestsN) || guestsN < 1 ? "Enter the number of guests" : null;

  const submit = async () => {
    if (problem) { setErr(problem); return; }
    if (isDemoSlug(store.slug)) { setErr("This is a demo store, so bookings are switched off here. On your own store this request goes straight to you."); return; }
    setBusy(true); setErr(null);
    const body: BookingInput = {
      product_id: product.id, name: name.trim(), phone: phone.trim(), guests: guestsN, event_type: eventType, date, time: stay ? "" : time,
      check_out: stay ? checkOut : null, note: note.trim(), website: trap,
    };
    try {
      const r = await storefront.book(store.slug, body);
      try { window.localStorage.setItem(SAVED, JSON.stringify({ ...JSON.parse(window.localStorage.getItem(SAVED) ?? "{}"), name: body.name, phone: body.phone })); } catch { /* storage unavailable */ }
      setDone(r.number);
    } catch (e) {
      setErr(errorMessage(e, "Couldn't send your request. Please try again or call us."));
    } finally { setBusy(false); }
  };

  const digits = (store.support_phone ?? "").replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Book ${product.name}`}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[var(--bg)] p-5 text-[var(--fg)] shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold leading-tight">{done !== null ? "Request sent" : "Book this"}</h2>
            <p className="mt-0.5 truncate text-[13.5px] text-[var(--muted)]">{product.name} · {store.name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Close"><X size={20} /></button>
        </div>

        {done !== null ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl bg-[var(--surface)] p-4">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)]"><Check size={17} /></span>
              <p className="text-[14px] leading-relaxed text-[var(--muted)]">
                Thank you, <b className="text-[var(--fg)]">{name.trim()}</b>. We have your request for <b className="text-[var(--fg)]">{product.name}</b> on{" "}
                <b className="text-[var(--fg)]">{date}{stay ? ` to ${checkOut}` : time ? `, ${time}` : ""}</b>. We&apos;ll call you to confirm the date and the price.
              </p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {full && <a href={`tel:+${full}`} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] px-4 py-3 text-[14px] font-semibold hover:border-[var(--muted)]"><Phone size={15} /> Call us</a>}
              {full && <a href={`https://wa.me/${full}?text=${encodeURIComponent(`Hi, I just sent a booking request for ${product.name} on ${date}.`)}`} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-[14px] font-semibold text-[var(--accent-fg)] hover:brightness-95"><MessageCircle size={15} /> WhatsApp us</a>}
            </div>
            <button onClick={onClose} className="w-full rounded-2xl border border-[var(--line)] px-4 py-3 text-[14px] font-semibold hover:border-[var(--muted)]">Done</button>
          </div>
        ) : (
          <div className="space-y-4">
            {stay ? (
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={label} htmlFor="bk-in">Check-in</label><input id="bk-in" type="date" className={field} min={today} value={date} onChange={(e) => { setDate(e.target.value); if (checkOut && checkOut <= e.target.value) setCheckOut(""); }} /></div>
                <div><label className={label} htmlFor="bk-out">Check-out</label><input id="bk-out" type="date" className={field} min={date || today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
              </div>
            ) : (
              <>
                <div><label className={label} htmlFor="bk-date">Event date</label><input id="bk-date" type="date" className={field} min={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div>
                  <span className={label}>Time</span>
                  <div className="grid grid-cols-2 gap-2">
                    {SLOTS.map(([s, hint]) => (
                      <button key={s} type="button" onClick={() => { setSlot(s); setExact(""); }}
                        className={`rounded-xl border px-3 py-2 text-left transition ${slot === s && !exact ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg))]" : "border-[var(--line)] hover:border-[var(--muted)]"}`}>
                        <span className="block text-[13.5px] font-semibold">{s}</span><span className="block text-[11.5px] text-[var(--muted)]">{hint}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <label className="shrink-0 text-[12.5px] text-[var(--muted)]" htmlFor="bk-time">or an exact time</label>
                    <input id="bk-time" type="time" className={`${field} max-w-[9rem]`} value={exact} onChange={(e) => setExact(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div><label className={label} htmlFor="bk-guests">Guests</label><input id="bk-guests" type="number" inputMode="numeric" min={1} max={5000} className={field} value={guests} onChange={(e) => setGuests(e.target.value)} /></div>
              {!stay && (
                <div><label className={label} htmlFor="bk-type">Event</label>
                  <select id="bk-type" className={field} value={eventType} onChange={(e) => setEventType(e.target.value)}>{EVENTS.map((x) => <option key={x}>{x}</option>)}</select></div>
              )}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div><label className={label} htmlFor="bk-name">Your name</label><input id="bk-name" className={field} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><label className={label} htmlFor="bk-phone">Mobile number</label><input id="bk-phone" className={field} autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            <div><label className={label} htmlFor="bk-note">Anything we should know? (optional)</label>
              <textarea id="bk-note" className={field} rows={2} maxLength={500} placeholder="Catering, decoration, parking, rooms for guests…" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="bk_extra" />

            {err && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">{err}</div>}
            <button onClick={submit} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3.5 text-[15px] font-semibold text-[var(--accent-fg)] transition hover:brightness-95 disabled:opacity-60">
              {busy ? <Loader2 size={17} className="animate-spin" /> : <CalendarCheck size={17} />} Send booking request
            </button>
            <p className="text-center text-[12px] text-[var(--muted)]">No payment now. We&apos;ll confirm availability and the final price by phone.</p>
          </div>
        )}
      </div>
    </div>
  );
}
