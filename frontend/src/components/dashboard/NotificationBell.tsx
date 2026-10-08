"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Bell, CheckCircle2, MessageSquare } from "lucide-react";
import { analytics, type NotificationItem } from "@/lib/api";
import { timeAgo, usePoll } from "@/components/ui/kit";

const SEEN_KEY = "wa_notifications_seen";
const ICONS = { error: AlertCircle, warning: AlertTriangle, success: CheckCircle2 } as const;
const COLORS = { error: "text-red-400", warning: "text-amber-400", success: "text-emerald-400" } as const;

function readSeen(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Live notifications: unread conversations + account/token/automation alerts derived by the backend. Polls every 20s. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread_messages: number; unread_conversations: number; items: NotificationItem[] } | null>(null);
  const [seen, setSeen] = useState<string[]>(() => (typeof window === "undefined" ? [] : readSeen()));

  usePoll(async () => {
    try {
      setData(await analytics.notifications());
    } catch {
      /* transient — keep the last good value */
    }
  }, 20_000);

  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<() => void>(() => {});

  const unseen = (data?.items ?? []).filter((i) => !seen.includes(i.id));
  const badge = (data?.unread_conversations ?? 0) + unseen.length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next && data) {
      const all = [...new Set([...seen, ...data.items.map((i) => i.id)])].slice(-200);
      setSeen(all);
      try {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify(all));
      } catch {
        /* storage unavailable */
      }
    }
  };

  toggleRef.current = toggle;

  // Close on an outside tap or Escape. A document listener instead of a fixed overlay, because the top bar's
  // backdrop-blur traps `position: fixed` inside the bar's bounds (same approach as the profile menu).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) toggleRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && toggleRef.current();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button type="button" onClick={toggle} aria-label={`Notifications${badge ? ` (${badge} new)` : ""}`} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {badge > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{badge > 9 ? "9+" : badge}</span>}
      </button>
      {open && (
        <>
          {/* On phones the panel spans the bar (its fixed containing block, see above) instead of hanging off the bell, which would clip off-screen left. */}
          <div className="fixed inset-x-3 top-full z-50 mt-1 overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:mt-2 sm:w-[360px] rounded-xl border border-white/10 bg-surface/95 shadow-2xl backdrop-blur-xl">
            <div className="border-b border-white/10 px-4 py-3 text-[13.5px] font-semibold text-white">Notifications</div>
            <div className="max-h-[min(420px,70dvh)] overflow-y-auto">
              {(data?.unread_conversations ?? 0) > 0 && (
                <Link href="/dashboard/inbox" onClick={toggle} className="flex items-start gap-3 border-b border-white/5 px-4 py-3 hover:bg-white/[0.04]">
                  <MessageSquare size={16} className="mt-0.5 text-sky-400" />
                  <div>
                    <div className="text-[13px] text-white">{data!.unread_messages} unread message{data!.unread_messages === 1 ? "" : "s"}</div>
                    <div className="text-[12px] text-white/45">in {data!.unread_conversations} conversation{data!.unread_conversations === 1 ? "" : "s"}</div>
                  </div>
                </Link>
              )}
              {(data?.items ?? []).map((n) => {
                const Icon = ICONS[n.type];
                return (
                  <Link key={n.id} href={n.href} onClick={toggle} className="flex items-start gap-3 border-b border-white/5 px-4 py-3 hover:bg-white/[0.04]">
                    <Icon size={16} className={`mt-0.5 shrink-0 ${COLORS[n.type]}`} />
                    <div className="min-w-0">
                      <div className="text-[13px] text-white">{n.title}{!seen.includes(n.id) && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />}</div>
                      {n.detail && <div className="truncate text-[12px] text-white/45">{n.detail}</div>}
                      <div className="mt-0.5 text-[11px] text-white/30">{timeAgo(n.at)}</div>
                    </div>
                  </Link>
                );
              })}
              {data && data.items.length === 0 && data.unread_conversations === 0 && <div className="px-4 py-10 text-center text-[13px] text-white/40">You&apos;re all caught up.</div>}
              {!data && <div className="px-4 py-10 text-center text-[13px] text-white/40">Loading…</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
