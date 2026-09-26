"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, googleSignIn, safeNextPath, storeSession } from "@/lib/api";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GIS_SRC = "https://accounts.google.com/gsi/client";

type GoogleId = {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: "popup"; context?: "signin" | "signup" }) => void;
  renderButton: (el: HTMLElement, o: Record<string, string | number>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let gisLoader: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisLoader ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoader = null;
      reject(new Error("Couldn't load Google sign-in."));
    };
    document.head.appendChild(s);
  });
  return gisLoader;
}

/**
 * "Continue with Google" via Google Identity Services. Always shown; until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set, clicking it
 * explains that Google sign-in isn't available yet instead of opening Google's popup.
 */
export default function GoogleSignInButton({ mode, companyName }: { mode: "login" | "signup"; companyName?: string }) {
  const router = useRouter();
  const holder = useRef<HTMLDivElement>(null);
  const company = useRef(companyName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  company.current = companyName;

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        const id = window.google?.accounts.id;
        if (cancelled || !id || !holder.current) return;
        id.initialize({
          client_id: CLIENT_ID,
          ux_mode: "popup",
          context: mode === "signup" ? "signup" : "signin",
          callback: async ({ credential }) => {
            setBusy(true);
            setError(null);
            try {
              const auth = await googleSignIn({ credential, companyName: company.current });
              storeSession(auth);
              router.push(auth.must_rotate_password ? "/rotate-password" : safeNextPath() ?? "/dashboard");
            } catch (err) {
              setError(errorMessage(err, "Google sign-in failed. Please try again."));
              setBusy(false);
            }
          },
        });
        // Google's own button is rendered invisibly over our styled one, so clicks still open Google's popup.
        holder.current.innerHTML = "";
        id.renderButton(holder.current, {
          type: "standard",
          size: "large",
          text: mode === "signup" ? "signup_with" : "continue_with",
          width: Math.min(400, holder.current.offsetWidth || 400),
        });
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [mode, router]);

  const configured = Boolean(CLIENT_ID);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[12px] uppercase tracking-wider text-white/35">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className={`group relative ${configured && (busy || !ready) ? "pointer-events-none opacity-60" : ""}`}>
        <button
          type="button"
          tabIndex={configured ? -1 : 0}
          aria-hidden={configured || undefined}
          onClick={configured ? undefined : () => setError("Google sign-in isn't available yet — please use your email and password for now.")}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-4 py-3 text-[14.5px] font-semibold text-neutral-900 transition-colors group-hover:bg-neutral-100"
        >
          <GoogleLogo />
          {busy ? "Signing in…" : mode === "signup" ? "Sign up with Google" : "Continue with Google"}
        </button>
        {configured && <div ref={holder} className="absolute inset-0 overflow-hidden rounded-xl opacity-[0.01] [&_iframe]:!h-full [&_iframe]:!w-full [&>div]:h-full" />}
      </div>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{error}</p>}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
