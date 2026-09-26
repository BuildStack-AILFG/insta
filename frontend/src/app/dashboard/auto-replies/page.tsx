"use client";

import { useEffect, useState } from "react";
import { AtSign, Clock3, Heart, MessageSquareReply, MoonStar, Sunrise } from "lucide-react";
import { Alert, Button, Card, Field, Input, Page, PageHeader, Select, Spinner, Textarea, Toggle, useUi } from "@/components/ui/kit";
import { errorMessage, getSettings, patchSettings } from "@/lib/api";

type Entry = { enabled: boolean; message: string; minutes?: number };
type StoryEntry = { enabled: boolean; message: string; link_title: string; link_url: string; tag: string };
type Auto = { welcome: Entry; away: Entry; delayed: Entry; story_mention: StoryEntry; story_reply: StoryEntry };
type Day = { enabled: boolean; start: string; end: string };
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<(typeof DAYS)[number], string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const EMPTY_STORY: StoryEntry = { enabled: false, message: "", link_title: "", link_url: "", tag: "" };
const EMPTY_AUTO: Auto = { welcome: { enabled: false, message: "" }, away: { enabled: false, message: "" }, delayed: { enabled: false, message: "", minutes: 5 }, story_mention: EMPTY_STORY, story_reply: EMPTY_STORY };
const STORY_KINDS = [
  { id: "story_mention", title: "Story mentions", icon: AtSign, desc: "When someone mentions you in their story. Sent at most once a day per person.", ph: "Thanks for the shoutout {{first_name}}! 💖 Here's 10% off your next order." },
  { id: "story_reply", title: "Replies to your stories", icon: Heart, desc: "When someone replies to one of your stories. Story-reply flows in the Flow Builder take priority.", ph: "Thanks for replying {{first_name}}! Here's the link from today's story 👇" },
] as const;
const DEFAULT_HOURS = Object.fromEntries(DAYS.map((d, i) => [d, { enabled: i < 5, start: "09:00", end: "18:00" }])) as Record<(typeof DAYS)[number], Day>;
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Jakarta", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo", "Africa/Lagos", "Australia/Sydney", "UTC"];

const KINDS = [
  { id: "welcome", title: "Welcome message", icon: Sunrise, desc: "Sent the first time a new contact messages you.", ph: "Hi {{first_name}}! Thanks for reaching out — how can we help today?" },
  { id: "away", title: "Away message", icon: MoonStar, desc: "Sent outside your business hours (at most once every 12 hours per customer).", ph: "We're offline right now — we'll reply first thing tomorrow." },
  { id: "delayed", title: "Delayed reply", icon: Clock3, desc: "Sent when nobody on your team has answered after a set time.", ph: "Thanks for your patience — a teammate will be with you shortly." },
] as const;

export default function AutoRepliesPage() {
  const { toast } = useUi();
  const [auto, setAuto] = useState<Auto | null>(null);
  const [tz, setTz] = useState("Asia/Kolkata");
  const [days, setDays] = useState(DEFAULT_HOURS);
  const [hoursSet, setHoursSet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(({ settings }) => {
      const a = (settings.auto_replies as Partial<Auto>) ?? {};
      setAuto({ welcome: { ...EMPTY_AUTO.welcome, ...a.welcome }, away: { ...EMPTY_AUTO.away, ...a.away }, delayed: { ...EMPTY_AUTO.delayed, ...a.delayed },
        story_mention: { ...EMPTY_STORY, ...a.story_mention }, story_reply: { ...EMPTY_STORY, ...a.story_reply } });
      const bh = settings.business_hours as { timezone?: string; days?: typeof days } | undefined;
      if (bh?.days) { setDays({ ...DEFAULT_HOURS, ...bh.days }); setTz(bh.timezone ?? "Asia/Kolkata"); setHoursSet(true); }
      else { try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (z) setTz(z); } catch { /* keep default */ } }
    }).catch((e) => setErr(errorMessage(e)));
  }, []);

  if (!auto) return err ? <Page><Alert>{err}</Alert></Page> : <Spinner />;
  const set = (k: "welcome" | "away" | "delayed", p: Partial<Entry>) => setAuto({ ...auto, [k]: { ...auto[k], ...p } });
  const setStory = (k: "story_mention" | "story_reply", p: Partial<StoryEntry>) => setAuto({ ...auto, [k]: { ...auto[k], ...p } });
  const save = async (key: string, body: Record<string, unknown>, ok: string) => { setBusy(key); setErr(null); try { await patchSettings(body); toast(ok); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); } };

  return (
    <Page>
      <PageHeader icon={<MessageSquareReply size={20} />} title="Auto-replies" subtitle="Automatic messages for common moments. Use {{first_name}}, {{name}} or {{trait.city}} to personalise." />
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <div className="space-y-4">
        {KINDS.map((k) => {
          const e = auto[k.id];
          return (
            <Card key={k.id} className="p-5">
              <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand"><k.icon size={18} /></div><div><div className="text-[14.5px] font-semibold text-white">{k.title}</div><div className="text-[12.5px] text-white/50">{k.desc}</div></div></div>
                <Toggle checked={e.enabled} onChange={(v) => set(k.id, { enabled: v })} label={`${k.title} enabled`} /></div>
              <Textarea className="mt-4" value={e.message} onChange={(ev) => set(k.id, { message: ev.target.value })} placeholder={k.ph} maxLength={1000} aria-label={`${k.title} text`} />
              {k.id === "delayed" && <Field className="mt-3 max-w-xs" label="Send after (minutes without a reply)"><Input type="number" min={1} max={1440} value={e.minutes ?? 5} onChange={(ev) => set("delayed", { minutes: Number(ev.target.value) })} /></Field>}
              {k.id === "away" && !hoursSet && e.enabled && <div className="mt-3"><Alert tone="yellow">No business hours are saved yet, so you&apos;re counted as always open and this message won&apos;t send. Set your hours below.</Alert></div>}
              <div className="mt-4 flex justify-end"><Button loading={busy === k.id} onClick={() => save(k.id, { auto_replies: auto }, `${k.title} saved`)}>Save</Button></div>
            </Card>
          );
        })}

        {STORY_KINDS.map((k) => {
          const e = auto[k.id];
          return (
            <Card key={k.id} className="p-5">
              <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand"><k.icon size={18} /></div><div><div className="text-[14.5px] font-semibold text-white">{k.title}</div><div className="text-[12.5px] text-white/50">{k.desc}</div></div></div>
                <Toggle checked={e.enabled} onChange={(v) => setStory(k.id, { enabled: v })} label={`${k.title} enabled`} /></div>
              <Textarea className="mt-4" value={e.message} onChange={(ev) => setStory(k.id, { message: ev.target.value })} placeholder={k.ph} maxLength={1000} aria-label={`${k.title} text`} />
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Button text (optional)"><Input value={e.link_title} maxLength={20} onChange={(ev) => setStory(k.id, { link_title: ev.target.value })} placeholder="Claim 10% off" /></Field>
                <Field label="Button link"><Input value={e.link_url} onChange={(ev) => setStory(k.id, { link_url: ev.target.value })} placeholder="https://…" /></Field>
                <Field label="Tag them as (optional)"><Input value={e.tag} maxLength={50} onChange={(ev) => setStory(k.id, { tag: ev.target.value })} placeholder="story-fan" /></Field>
              </div>
              <div className="mt-4 flex justify-end"><Button loading={busy === k.id} onClick={() => save(k.id, { auto_replies: auto }, `${k.title} saved`)}>Save</Button></div>
            </Card>
          );
        })}

        <Card className="p-5">
          <div className="mb-1 text-[14.5px] font-semibold text-white">Business hours</div>
          <p className="mb-4 text-[12.5px] text-white/50">Drives the away message. Outside these hours your team is considered offline.</p>
          <Field label="Timezone" className="mb-4 max-w-xs"><Select value={tz} onChange={(e) => setTz(e.target.value)}>{[...new Set([tz, ...TIMEZONES])].map((z) => <option key={z}>{z}</option>)}</Select></Field>
          <div className="space-y-2">{DAYS.map((d) => (
            <div key={d} className="flex flex-wrap items-center gap-3"><div className="flex w-36 items-center gap-3"><Toggle checked={days[d].enabled} onChange={(v) => setDays({ ...days, [d]: { ...days[d], enabled: v } })} label={`${DAY_LABEL[d]} open`} /><span className="text-[13px] text-white/80">{DAY_LABEL[d]}</span></div>
              {days[d].enabled ? <div className="flex items-center gap-2"><Input type="time" className="!w-32" value={days[d].start} onChange={(ev) => setDays({ ...days, [d]: { ...days[d], start: ev.target.value } })} aria-label={`${DAY_LABEL[d]} opens`} /><span className="text-white/40">to</span><Input type="time" className="!w-32" value={days[d].end} onChange={(ev) => setDays({ ...days, [d]: { ...days[d], end: ev.target.value } })} aria-label={`${DAY_LABEL[d]} closes`} /></div> : <span className="text-[12.5px] text-white/35">Closed</span>}</div>))}</div>
          <div className="mt-4 flex justify-end"><Button loading={busy === "hours"} onClick={async () => { await save("hours", { business_hours: { timezone: tz, days } }, "Business hours saved"); setHoursSet(true); }}>Save hours</Button></div>
        </Card>
      </div>
    </Page>
  );
}
