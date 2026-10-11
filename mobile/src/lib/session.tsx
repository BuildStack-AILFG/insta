import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import * as api from "@/lib/api";
import type { MeResponse } from "@/lib/api";
import { registerForPush, unregisterPush } from "@/lib/push";

type SessionState = {
  /** False while we read the keystore on launch. */
  ready: boolean;
  me: MeResponse | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** The website refreshed its tokens: keep the app's copy in step (the next launch and push registration use it). */
  adoptWebTokens: (auth: api.AuthResponse) => Promise<void>;
  /** The website signed out (it already revoked the refresh token): forget this phone and show the login screen. */
  signedOutOnWeb: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    api.onSessionExpired(() => setMe(null));
    (async () => {
      try {
        if (await api.loadSession()) {
          setMe(await api.getMe());
          void registerForPush();
        }
      } catch {
        // Offline or the session is gone: show the login screen (an expired session is already cleared by the API client).
      } finally {
        setReady(true);
      }
    })();
    return () => api.onSessionExpired(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = await api.login({ email: email.trim(), password });
    await api.storeSession(auth);
    setMe(await api.getMe());
    void registerForPush();
  }, []);

  const adoptWebTokens = useCallback(async (auth: api.AuthResponse) => {
    await api.storeSession(auth, { fromWeb: true });
  }, []);

  const signedOutOnWeb = useCallback(async () => {
    await unregisterPush();
    await api.clearSession();
    setMe(null);
  }, []);

  const value = useMemo(() => ({ ready, me, signIn, adoptWebTokens, signedOutOnWeb }), [ready, me, signIn, adoptWebTokens, signedOutOnWeb]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
