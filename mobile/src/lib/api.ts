// The app's own API surface: sign-in and push devices. Everything else is the web dashboard, shown in a WebView (src/app/index.tsx).
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:8001/api";
export const WEB_URL: string = process.env.EXPO_PUBLIC_WEB_URL ?? (Constants.expoConfig?.extra?.webUrl as string | undefined) ?? "https://gramforgrow.in";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return "Can't reach GramForGrow. Check your internet connection.";
  return fallback;
}

// ---- session ------------------------------------------------------------------------------------------------------------------------

// Same localStorage keys as frontend/src/lib/api.ts — the WebView's copy of the session lives under them.
export const ACCESS_TOKEN_KEY = "gfg_access_token";
export const REFRESH_TOKEN_KEY = "gfg_refresh_token";
const GEN_KEY = "gfg_session_gen";

export type MeResponse = {
  user_id: string;
  email: string;
  full_name: string | null;
  must_rotate_password: boolean;
  role: string | null;
  workspace: { id: string; name: string; plan_name: string };
};
export type AuthResponse = { access_token: string; refresh_token: string };

/**
 * Refresh tokens rotate (using one revokes it), so the app and the WebView must never both hold "their own" pair. `gen` goes up
 * whenever the app itself gets new tokens (sign-in, or its own refresh); the WebView adopts the app's pair only when its stored
 * gen differs — otherwise the website keeps its pair, which may be newer, and reports every change back (see src/app/index.tsx).
 */
export type Session = { access: string; refresh: string; gen: number };
let session: { access: string | null; refresh: string | null; gen: number } = { access: null, refresh: null, gen: 0 };

export async function loadSession(): Promise<boolean> {
  const [access, refresh, gen] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY), SecureStore.getItemAsync(REFRESH_TOKEN_KEY), SecureStore.getItemAsync(GEN_KEY),
  ]);
  session = { access, refresh, gen: Number(gen) || 0 };
  return !!access;
}
/** `fromWeb`: the website refreshed its tokens — keep a copy without bumping gen, so the WebView isn't overwritten with its own pair. */
export async function storeSession(auth: AuthResponse, { fromWeb = false } = {}) {
  session = { access: auth.access_token, refresh: auth.refresh_token, gen: fromWeb ? session.gen : session.gen + 1 };
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, auth.access_token),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, auth.refresh_token),
    SecureStore.setItemAsync(GEN_KEY, String(session.gen)),
  ]);
}
export async function clearSession() {
  session = { ...session, access: null, refresh: null };
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY), SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)]);
}
export const getRefreshToken = () => session.refresh;
export const currentSession = (): Session | null => (session.access && session.refresh ? { access: session.access, refresh: session.refresh, gen: session.gen } : null);

/** The session provider subscribes here to send the user back to the login screen when the session can't be refreshed. */
let onExpired: (() => void) | null = null;
export function onSessionExpired(fn: (() => void) | null) {
  onExpired = fn;
}

// ---- transport -------------------------------------------------------------------------------------------------------------------------

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      const detail = body.detail ?? body;
      if (Array.isArray(detail)) {
        // FastAPI validation errors: show the first one readably
        const first = detail[0];
        message = first?.msg ? `${(first.loc ?? []).slice(1).join(".") || "Input"}: ${first.msg}` : message;
      } else {
        message = detail?.error ?? message;
      }
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time; every request that hit a 401 waits on the same promise. */
async function refreshSession(): Promise<boolean> {
  const rt = session.refresh;
  if (!rt) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }) });
      if (!res.ok) return false;
      await storeSession(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

type Opts = { method?: string; body?: unknown; auth?: boolean };

async function raw(path: string, o: Opts, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_URL}${path}`, { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

async function request<T>(path: string, o: Opts = {}): Promise<T> {
  const auth = o.auth !== false;
  let res = await raw(path, o, auth ? session.access : null);
  if (res.status === 401 && auth && (await refreshSession())) res = await raw(path, o, session.access);
  if (res.status === 401 && auth && !path.startsWith("/auth/")) {
    await clearSession();
    onExpired?.();
  }
  return parse<T>(res);
}

// ---- endpoints -------------------------------------------------------------------------------------------------------------------------

export const getMe = () => request<MeResponse>("/auth/me");
export const login = (i: { email: string; password: string }) => request<AuthResponse>("/auth/login", { method: "POST", auth: false, body: i });
export const logout = (refresh_token: string) => request<void>("/auth/logout", { method: "POST", auth: false, body: { refresh_token } });

export const devices = {
  register: (token: string, platform: "android" | "ios") => request<void>("/devices", { method: "POST", body: { token, platform } }),
  unregister: (token: string) => request<void>("/devices/unregister", { method: "POST", body: { token } }),
};
