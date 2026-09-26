"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, clearSession, getMe, ApiError, type MeResponse } from "@/lib/api";
import { WorkspaceContext } from "./WorkspaceContext";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setMe(await getMe());
  }, []);

  const load = useCallback(() => {
    setFailed(null);
    if (!getAccessToken()) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    getMe()
      .then((m) => {
        if (m.must_rotate_password) {
          router.replace("/rotate-password");
          return;
        }
        setMe(m);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          router.replace("/login");
        } else {
          // network down / server error: don't sit on a spinner forever
          setFailed(err instanceof ApiError ? err.message : "Can't reach the server.");
        }
      });
  }, [router]);

  useEffect(load, [load]);

  if (failed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <p className="text-[15px] font-medium text-white">We couldn&apos;t load your workspace</p>
        <p className="max-w-sm text-[13px] text-white/50">{failed}</p>
        <button onClick={load} className="rounded-lg bg-brand px-4 py-2 text-[13.5px] font-medium text-white hover:brightness-110">Try again</button>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-[14px] text-white/60">Loading…</p>
      </div>
    );
  }
  return <WorkspaceContext.Provider value={{ ...me, refresh }}>{children}</WorkspaceContext.Provider>;
}
