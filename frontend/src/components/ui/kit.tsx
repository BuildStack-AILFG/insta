"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";

export const ACCENT = "var(--brand)";
/** Translucent brand tint that follows the theme (a CSS variable can't take a hex-alpha suffix like `${ACCENT}22`). */
export const accentTint = (pct: number) => `color-mix(in srgb, var(--brand) ${pct}%, transparent)`;
export const inkTint = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`;
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---- formatting --------------------------------------------------------------------------------------------------------------------------------

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");
export const fmtNum = (n: number) => n.toLocaleString();
export function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

// ---- hooks ----------------------------------------------------------------------------------------------------------------------------------------

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Runs `fn` now and every `ms` while the tab is visible. Returns nothing; `fn` owns its own state. */
export function usePoll(fn: () => void | Promise<void>, ms: number, deps: unknown[] = []) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    let stop = false;
    const tick = () => {
      if (!stop && document.visibilityState === "visible") void ref.current();
    };
    tick();
    const id = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

// ---- primitives --------------------------------------------------------------------------------------------------------------------------------------

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "soft"; size?: "sm" | "md"; loading?: boolean };
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "btn-accent text-white hover:brightness-110",
    ghost: "border border-white/10 bg-card text-white/80 hover:bg-white/[0.07]",
    soft: "bg-white/[0.06] text-white hover:bg-white/[0.1]",
    danger: "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={variant === "primary" ? { background: ACCENT, ...rest.style } : rest.style}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50", size === "sm" ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13.5px]", styles, className)}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-white/10 bg-card backdrop-blur-xl", className)}>{children}</div>;
}

const TONES = {
  green: "bg-emerald-500/15 text-pink-300 border-emerald-500/25",
  yellow: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  red: "bg-red-500/15 text-red-300 border-red-500/25",
  blue: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  gray: "bg-white/[0.06] text-white/65 border-white/10",
};
export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium", TONES[tone], className)}>{children}</span>;
}
export function statusTone(s: string): keyof typeof TONES {
  if (["approved", "connected", "completed", "published", "delivered", "read", "sent", "ready", "open"].includes(s)) return "green";
  if (["pending", "scheduled", "sending", "waiting", "running", "draft", "queued"].includes(s)) return "yellow";
  if (["rejected", "failed", "error", "disabled", "paused", "cancelled", "disconnected"].includes(s)) return "red";
  return "gray";
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: accentTint(13), color: ACCENT }}>{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold sm:text-[22px] tracking-tight text-white">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-[13px] text-white/55 sm:text-[13.5px]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cx("mx-auto w-full px-4 py-5 sm:px-6 sm:py-8", wide ? "max-w-[1400px]" : "max-w-6xl")}>{children}</div>;
}

const fieldCls = "w-full rounded-lg border border-white/10 bg-field px-3 py-2 text-[13.5px] text-white placeholder:text-white/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50";
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldCls, "min-h-[84px] resize-y", props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldCls, "[&>option]:bg-surface", props.className)} />;
}
export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="mb-1.5 block text-[12.5px] font-medium text-white/70">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-[11.5px] text-white/40">{hint}</span>}
      {error && <span className="mt-1 block text-[11.5px] text-red-300">{error}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50" style={{ background: checked ? ACCENT : inkTint(18) }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-[#f8f9f2] transition-all" style={{ left: checked ? 22 : 2 }} />
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-white/10 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cx("-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition sm:px-4 sm:text-[13.5px]", value === t.id ? "text-white" : "border-transparent text-white/50 hover:text-white/80")}
          style={value === t.id ? { borderColor: ACCENT } : undefined}>
          {t.label}
          {t.count !== undefined && <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[11px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-[13.5px] text-white/50">
      <Loader2 size={16} className="animate-spin" /> {label ?? "Loading…"}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center sm:px-6 sm:py-14">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-white/60">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-white">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-[13px] text-white/50">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "red", children, onClose }: { tone?: "red" | "green" | "yellow" | "blue"; children: ReactNode; onClose?: () => void }) {
  const t = { red: "border-red-500/30 bg-red-500/10 text-red-200", green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200", yellow: "border-amber-500/30 bg-amber-500/10 text-amber-200", blue: "border-sky-500/30 bg-sky-500/10 text-sky-200" }[tone];
  const Icon = tone === "green" ? CheckCircle2 : tone === "blue" ? Info : AlertCircle;
  return (
    <div className={cx("mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px]", t)} role="alert">
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && <button onClick={onClose} aria-label="Dismiss"><X size={14} /></button>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-white/10 bg-surface shadow-2xl sm:max-h-[90vh] sm:rounded-2xl" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5 sm:py-4">
          <h2 className="min-w-0 text-[15px] font-semibold text-white sm:text-[16px]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

// ---- toasts & confirm --------------------------------------------------------------------------------------------------------------------------------

type Toast = { id: number; tone: "success" | "error" | "info"; text: string };
type Ctx = { toast: (text: string, tone?: Toast["tone"]) => void; confirm: (o: { title: string; body?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean> };
const ToastCtx = createContext<Ctx | null>(null);

export function useUi(): Ctx {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useUi must be used inside <UiProvider>");
  return c;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<{ title: string; body?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const idRef = useRef(0);

  const toast = useCallback((text: string, tone: Toast["tone"] = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6500 : 3500);
  }, []);
  const confirm = useCallback<Ctx["confirm"]>((o) => new Promise((resolve) => setDialog({ ...o, resolve })), []);
  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <ToastCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[200] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:items-end">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={cx("pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] shadow-xl backdrop-blur-xl",
            t.tone === "error" ? "border-red-500/40 bg-red-950/90 text-red-100" : t.tone === "info" ? "border-sky-500/40 bg-sky-950/90 text-sky-100" : "border-emerald-500/40 bg-emerald-950/90 text-emerald-100")}>
            {t.tone === "error" ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : t.tone === "info" ? <Info size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <Modal open={!!dialog} onClose={() => close(false)} title={dialog?.title ?? ""} width={440}
        footer={<><Button variant="ghost" onClick={() => close(false)}>Cancel</Button><Button variant={dialog?.danger ? "danger" : "primary"} onClick={() => close(true)}>{dialog?.confirmLabel ?? "Confirm"}</Button></>}>
        <p className="text-[13.5px] text-white/70">{dialog?.body}</p>
      </Modal>
    </ToastCtx.Provider>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const { toast } = useUi();
  return (
    <div>
      {label && <span className="mb-1.5 block text-[12.5px] font-medium text-white/70">{label}</span>}
      <div className="flex min-w-0 gap-2">
        <input readOnly value={value} onFocus={(e) => e.target.select()} className={cx(fieldCls, "font-mono text-[12.5px]")} />
        <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(value).then(() => toast("Copied to clipboard"), () => toast("Couldn't copy — select and copy manually", "error"))}>Copy</Button>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "green" | "red" }) {
  return (
    <Card className="p-4">
      <div className="text-[12px] text-white/50">{label}</div>
      <div className={cx("mt-1 text-[20px] font-semibold sm:text-[24px]", tone === "red" ? "text-red-300" : "text-white")}>{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-white/40">{sub}</div>}
    </Card>
  );
}
