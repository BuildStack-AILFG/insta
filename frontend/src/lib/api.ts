const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api";

export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export type PasswordFailure = { rule: string; message: string };

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Set on a 402 when the workspace's plan doesn't include the feature (e.g. "api_access"). */
  feature?: string;
  problems?: string[];
  passwordFailures?: PasswordFailure[];

  constructor(status: number, message: string, extra?: { code?: string; feature?: string; problems?: string[]; passwordFailures?: PasswordFailure[] }) {
    super(message);
    this.status = status;
    this.code = extra?.code;
    this.feature = extra?.feature;
    this.problems = extra?.problems;
    this.passwordFailures = extra?.passwordFailures;
  }
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ---- session ------------------------------------------------------------------------------------------------------------------------

const ACCESS_TOKEN_KEY = "gfg_access_token";
const REFRESH_TOKEN_KEY = "gfg_refresh_token";

export type Workspace = { id: string; name: string; slug: string; plan_id: string; trial_ends_at: string | null };
export type PlanKind = "trial" | "free" | "active" | "grace" | "custom";
export type PlanState = { kind: PlanKind; ends_at: string | null; days_left: number; expired: boolean };
/** Keys of the plan feature switches (see backend/app/services/plan_catalog.py). */
export type FeatureKey = "ai_agent" | "conversation_analytics" | "automation_reports" | "sales_reports" | "assignment_rules" | "api_access" | "integrations"
  | "shop" | "giveaways" | "intent_matching" | "segments" | "pipeline";
export type MeWorkspace = Workspace & { plan_name: string; plan_state: PlanState; features: Record<FeatureKey, boolean> };
export type MeResponse = {
  user_id: string;
  email: string;
  full_name: string | null;
  must_rotate_password: boolean;
  role: string | null;
  is_platform_admin: boolean;
  workspace: MeWorkspace;
};
export type AuthResponse = {
  user_id: string;
  email: string;
  role: string;
  workspace: Workspace;
  access_token: string;
  refresh_token: string;
  expires_in_minutes: number;
  must_rotate_password: boolean;
};

export function storeSession(auth: { access_token: string; refresh_token: string }) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, auth.access_token);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, auth.refresh_token);
}
/** Where to send the user after signing in: the `next` query param, but only for our own dashboard/admin paths (never an external URL). */
export function safeNextPath(): string | null {
  if (typeof window === "undefined") return null;
  const n = new URLSearchParams(window.location.search).get("next");
  return n && /^\/(dashboard|admin)(\/\S*)?$/.test(n) && !n.includes("\\") ? n : null;
}
export function clearSession() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}
export function getAccessToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(ACCESS_TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

// ---- transport -------------------------------------------------------------------------------------------------------------------------

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let extra: ConstructorParameters<typeof ApiError>[2];
    try {
      const body = await res.json();
      const detail = body.detail ?? body;
      if (Array.isArray(detail)) {
        // FastAPI validation errors: show the first one readably
        const first = detail[0];
        message = first?.msg ? `${(first.loc ?? []).slice(1).join(".") || "Input"}: ${first.msg}` : message;
      } else {
        message = detail?.error ?? message;
        extra = { code: detail?.code, feature: detail?.feature, problems: detail?.problems, passwordFailures: detail?.password_failures };
      }
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, message, extra);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time; every request that hit a 401 waits on the same promise. */
async function refreshSession(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }) });
      if (!res.ok) return false;
      storeSession(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

type Opts = { method?: string; body?: unknown; form?: FormData; auth?: boolean; signal?: AbortSignal; headers?: Record<string, string> };

async function raw(path: string, o: Opts, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (!o.form) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_URL}${path}`, { method: o.method ?? "GET", headers, signal: o.signal, body: o.form ?? (o.body === undefined ? undefined : JSON.stringify(o.body)) });
}

async function request<T>(path: string, o: Opts = {}): Promise<T> {
  const auth = o.auth !== false;
  let res = await raw(path, o, auth ? getAccessToken() : null);
  if (res.status === 401 && auth && (await refreshSession())) res = await raw(path, o, getAccessToken());
  if (res.status === 401 && auth && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    clearSession();
    window.location.replace("/login");
  }
  return parse<T>(res);
}

/** Fetch an authenticated file (media, CSV) and return a blob URL / trigger a download. */
export async function fetchBlob(path: string): Promise<{ blob: Blob; type: string }> {
  let res = await raw(path, {}, getAccessToken());
  if (res.status === 401 && (await refreshSession())) res = await raw(path, {}, getAccessToken());
  if (!res.ok) throw new ApiError(res.status, "Couldn't load the file.");
  const blob = await res.blob();
  return { blob, type: blob.type };
}
export async function downloadFile(path: string, filename: string) {
  const { blob } = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const qs = (p?: Record<string, string | number | boolean | undefined | null>) => {
  const u = new URLSearchParams();
  Object.entries(p ?? {}).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.set(k, String(v)));
  const s = u.toString();
  return s ? `?${s}` : "";
};

// ---- auth --------------------------------------------------------------------------------------------------------------------------------

export const getMe = () => request<MeResponse>("/auth/me");
export const register = (i: { companyName: string; fullName?: string; email: string; password: string }) =>
  request<AuthResponse>("/auth/register", { method: "POST", auth: false, body: { company_name: i.companyName, full_name: i.fullName || undefined, email: i.email, password: i.password } });
export const login = (i: { email: string; password: string }) => request<AuthResponse>("/auth/login", { method: "POST", auth: false, body: i });
/** Exchanges a Google Identity Services ID token for a session; creates the account (and workspace) on first use. */
export const googleSignIn = (i: { credential: string; companyName?: string }) =>
  request<AuthResponse>("/auth/google", { method: "POST", auth: false, body: { credential: i.credential, company_name: i.companyName?.trim() || undefined } });
export const logout = (refresh_token: string) => request<void>("/auth/logout", { method: "POST", auth: false, body: { refresh_token } });
export const forgotPassword = (email: string) => request<{ success: boolean; message: string }>("/auth/forgot-password", { method: "POST", auth: false, body: { email } });
export const resetPassword = (token: string, new_password: string) => request<void>("/auth/reset-password", { method: "POST", auth: false, body: { token, new_password } });
export const rotatePassword = (i: { currentPassword: string; newPassword: string }) =>
  request<void>("/auth/rotate-password", { method: "POST", body: { current_password: i.currentPassword, new_password: i.newPassword } });

// ---- Instagram accounts ---------------------------------------------------------------------------------------------------------------------

export type IceBreaker = { question: string; payload: string };
export type IgAccount = {
  id: string; ig_user_id: string; username: string; name: string | null; account_type: string | null; profile_picture_url: string | null;
  followers_count: number | null; media_count: number | null; connection_type: "oauth" | "manual"; status: "connected" | "error" | "disconnected";
  last_error: string | null; webhooks_subscribed: boolean; scopes: string[]; token_expires_at: string | null; last_webhook_at: string | null;
  last_synced_at: string | null; created_at: string | null; ice_breakers: IceBreaker[]; human_agent_tag: boolean; warnings?: string[];
};
export type IgConfig = {
  oauth_enabled: boolean;
  /** Only returned to platform admins — the Meta app belongs to the platform, not to customer workspaces. */
  setup?: IgSetup;
};
export type IgSetup = {
  app_id_configured: boolean; app_secret_configured: boolean; webhook_url: string; deauthorize_url: string; data_deletion_url: string; verify_token: string; redirect_uri: string; scopes: string[]; graph_version: string;
};
export type IgMedia = {
  id: string; caption: string | null; media_type: string | null; media_product_type: string | null; thumbnail_url: string | null; permalink: string | null;
  timestamp: string | null; comments_count: number | null; like_count: number | null;
};
export const instagram = {
  config: () => request<IgConfig>("/instagram/config"),
  list: () => request<IgAccount[]>("/instagram/accounts"),
  oauthUrl: () => request<{ url: string }>("/instagram/oauth/url"),
  finishOauth: (code: string, state: string) => request<IgAccount>("/instagram/oauth/callback", { method: "POST", body: { code, state } }),
  connectToken: (access_token: string) => request<IgAccount>("/instagram/accounts", { method: "POST", body: { access_token } }),
  refresh: (id: string) => request<IgAccount>(`/instagram/accounts/${id}/refresh`, { method: "POST" }),
  update: (id: string, b: { ice_breakers?: { question: string; payload?: string }[]; human_agent_tag?: boolean }) => request<IgAccount>(`/instagram/accounts/${id}`, { method: "PATCH", body: b }),
  media: (id: string, after?: string) => request<{ items: IgMedia[]; after: string | null }>(`/instagram/accounts/${id}/media${qs({ after })}`),
  disconnect: (id: string) => request<void>(`/instagram/accounts/${id}`, { method: "DELETE" }),
};

// ---- comment automations ----------------------------------------------------------------------------------------------------------------------

export type MediaPreview = { id: string; caption?: string | null; thumbnail_url?: string | null; permalink?: string | null };
export type CommentAutomationInput = {
  account_id: string; name: string; status: "active" | "paused"; media_scope: "all" | "specific" | "next" | "live"; media_ids: string[]; media_preview: MediaPreview[];
  match_type: "any" | "contains" | "exact"; keywords: string[]; exclude_keywords: string[]; public_reply_enabled: boolean; public_replies: string[];
  dm_enabled: boolean; dm_text: string; dm_text_b: string; dm_buttons: { title: string; url: string }[]; flow_id: string | null; once_per_user: boolean;
  gate: "none" | "follow" | "email" | "phone"; gate_prompt: string; gate_button: string; gate_retry_text: string; track_clicks: boolean;
  reminder_enabled: boolean; reminder_after_minutes: number; reminder_text: string;
};
export type CommentAutomation = CommentAutomationInput & {
  id: string; account_username: string | null; stats: { comments_matched: number; public_replies_sent: number; dms_sent: number; gates_passed: number; link_clicks: number; reminders_sent: number };
  last_triggered_at: string | null; created_at: string | null; updated_at: string | null;
};
export type CommentActivity = {
  id: string; comment_id: string; media_id: string | null; media_product_type: string | null; is_live: boolean; username: string | null; text: string | null;
  outcome: "pending" | "no_match" | "matched" | "skipped_repeat" | "moderated" | "failed"; error: string | null; automation: { id: string; name: string } | null;
  moderation: "hidden" | "deleted" | null; moderation_reason: string | null;
  public_reply: boolean; dm_sent: boolean; contact_id: string | null; created_at: string | null;
};
export const commentAutomations = {
  list: () => request<CommentAutomation[]>("/comment-automations"),
  get: (id: string) => request<CommentAutomation>(`/comment-automations/${id}`),
  create: (b: CommentAutomationInput) => request<CommentAutomation>("/comment-automations", { method: "POST", body: b }),
  update: (id: string, b: CommentAutomationInput) => request<CommentAutomation>(`/comment-automations/${id}`, { method: "PUT", body: b }),
  setStatus: (id: string, status: "active" | "paused") => request<CommentAutomation>(`/comment-automations/${id}`, { method: "PATCH", body: { status } }),
  remove: (id: string) => request<void>(`/comment-automations/${id}`, { method: "DELETE" }),
  activity: (p?: { automation_id?: string; outcome?: string; limit?: number; offset?: number }) => request<Page<CommentActivity>>(`/comment-automations/activity/comments${qs(p)}`),
  variants: (id: string) => request<{ enabled: boolean } & Record<"A" | "B", { sent: number; clicked: number; click_rate: number }>>(`/comment-automations/${id}/variants`),
  moderate: (rowId: string, action: "hide" | "unhide" | "delete") =>
    request<{ id: string; moderation: CommentActivity["moderation"]; moderation_reason: string | null }>(`/comment-automations/activity/comments/${rowId}/moderate`, { method: "POST", body: { action } }),
};

// ---- giveaways -------------------------------------------------------------------------------------------------------------------------------

export type GiveawayWinner = { comment_id: string; ig_id: string | null; username: string; text: string; timestamp: string | null; notified: boolean; error: string | null };
export type GiveawayInput = {
  account_id: string; name: string; media_id: string; media_preview: MediaPreview | Record<string, never>; keyword: string; min_mentions: number;
  unique_users: boolean; exclude_usernames: string[]; winners_count: number;
};
export type Giveaway = GiveawayInput & {
  id: string; account_username: string | null; status: "draft" | "drawn"; comments_total: number; entries_count: number; winners: GiveawayWinner[];
  drawn_at: string | null; notify_message: string; notified_at: string | null; created_at: string | null;
};
export const giveaways = {
  list: () => request<Giveaway[]>("/giveaways"),
  create: (b: GiveawayInput) => request<Giveaway>("/giveaways", { method: "POST", body: b }),
  update: (id: string, b: GiveawayInput) => request<Giveaway>(`/giveaways/${id}`, { method: "PUT", body: b }),
  draw: (id: string) => request<Giveaway>(`/giveaways/${id}/draw`, { method: "POST" }),
  notify: (id: string, message: string) => request<Giveaway>(`/giveaways/${id}/notify`, { method: "POST", body: { message } }),
  remove: (id: string) => request<void>(`/giveaways/${id}`, { method: "DELETE" }),
};

// ---- contacts -------------------------------------------------------------------------------------------------------------------------------

export type Contact = {
  id: string; name: string; username: string | null; profile_pic_url: string | null; is_follower: boolean | null; follower_count: number | null;
  phone: string | null; email: string | null; tags: string[]; traits: Record<string, unknown>; source: string; opted_out: boolean;
  last_contacted_at: string | null; created_at: string;
};
export type ContactDetail = Contact & { events: { name: string; properties: Record<string, unknown>; source: string; at: string }[]; ad_attribution: Record<string, string> };
export type Page<T> = { total: number; items: T[] };
export const contacts = {
  list: (p: { q?: string; tag?: string; opted_out?: boolean; source?: string; segment_id?: string; sort?: string; limit?: number; offset?: number }) => request<Page<Contact>>(`/contacts${qs(p)}`),
  get: (id: string) => request<ContactDetail>(`/contacts/${id}`),
  create: (b: { name: string; phone: string; email?: string; tags?: string[]; traits?: Record<string, unknown> }) => request<Contact>("/contacts", { method: "POST", body: b }),
  update: (id: string, b: Partial<{ name: string; email: string | null; phone: string; tags: string[]; traits: Record<string, unknown>; opted_out: boolean }>) => request<Contact>(`/contacts/${id}`, { method: "PATCH", body: b }),
  remove: (id: string) => request<void>(`/contacts/${id}`, { method: "DELETE" }),
  tags: () => request<{ tag: string; count: number }[]>("/contacts/tags"),
  traits: () => request<string[]>("/contacts/traits"),
  bulk: (b: { ids: string[]; action: "add_tag" | "remove_tag" | "opt_out" | "opt_in" | "delete"; tag?: string }) => request<{ affected: number }>("/contacts/bulk", { method: "POST", body: b }),
  addEvent: (id: string, name: string, properties: Record<string, unknown> = {}) => request<{ ok: boolean }>(`/contacts/${id}/events`, { method: "POST", body: { name, properties } }),
  importCsv: (file: File, o: { default_country_code?: string; update_existing?: boolean; add_tag?: string }) => {
    const f = new FormData();
    f.append("file", file);
    f.append("default_country_code", o.default_country_code ?? "");
    f.append("update_existing", String(o.update_existing ?? true));
    f.append("add_tag", o.add_tag ?? "");
    return request<{ created: number; updated: number; skipped: number; total_rows: number; errors: { row: number; error: string }[]; more_errors: number }>("/contacts/import", { method: "POST", form: f });
  },
  exportCsv: (p: { q?: string; tag?: string; opted_out?: boolean }) => downloadFile(`/contacts/export/csv${qs(p)}`, "contacts.csv"),
};

// ---- inbox --------------------------------------------------------------------------------------------------------------------------------------

export type ConversationSummary = {
  id: string; status: "open" | "resolved"; inbox_status: "bot" | "intervened"; labels: string[]; unread_count: number; last_message_at: string | null;
  last_message_preview: string | null; window_open: boolean; window_expires_at: string | null; human_agent_until: string | null; account_id: string;
  assigned_user: { id: string; name: string } | null;
  contact: { id: string; name: string; username: string | null; profile_pic_url: string | null; phone: string | null; opted_out: boolean; is_follower: boolean | null };
};
export type ConversationDetail = ConversationSummary & {
  contact: ConversationSummary["contact"] & { email: string | null; tags: string[]; traits: Record<string, unknown>; source: string; ad_attribution: Record<string, string>; follower_count: number | null; created_at: string };
  events: { name: string; properties: Record<string, unknown>; at: string }[];
};
export type ChatMessage = {
  id: string; direction: "in" | "out"; type: string; body: string | null; status: string; error: string | null; sender_type: string; sender_user_id: string | null;
  is_internal: boolean; has_media: boolean; media_url: string | null; media_mime: string | null; media_filename: string | null; payload: Record<string, unknown>;
  created_at: string; sent_at: string | null; delivered_at: string | null; read_at: string | null;
};
export type SendBody = { type: "text" | "image" | "video" | "audio" | "file" | "buttons" | "note"; text?: string; media_url?: string; buttons?: { title: string; url: string }[]; keep_bot?: boolean };
export const inbox = {
  list: (p: { status?: string; assigned?: string; unread?: boolean; q?: string; label?: string; mode?: string; limit?: number; offset?: number }) => request<Page<ConversationSummary>>(`/inbox/conversations${qs(p)}`),
  summary: () => request<{ open: number; unread_conversations: number; unassigned: number; mine: number; resolved: number; unread_messages: number; labels: string[] }>("/inbox/summary"),
  get: (id: string) => request<ConversationDetail>(`/inbox/conversations/${id}`),
  messages: (id: string, p?: { limit?: number; before?: string }) => request<{ items: ChatMessage[]; has_more: boolean; window_open: boolean; window_expires_at: string | null }>(`/inbox/conversations/${id}/messages${qs(p)}`),
  send: (id: string, b: SendBody) => request<ChatMessage>(`/inbox/conversations/${id}/messages`, { method: "POST", body: b }),
  read: (id: string) => request<{ ok: boolean }>(`/inbox/conversations/${id}/read`, { method: "POST" }),
  patch: (id: string, b: { status?: string; assigned_user_id?: string | null; labels?: string[]; inbox_status?: string }) =>
    request<ConversationSummary>(`/inbox/conversations/${id}`, { method: "PATCH", body: { ...b, assigned_user_id: b.assigned_user_id === null ? "none" : b.assigned_user_id } }),
  start: (contact_id: string) => request<ConversationSummary>("/inbox/conversations", { method: "POST", body: { contact_id } }),
};

// ---- segments ------------------------------------------------------------------------------------------------------------------------------------

export type SegmentRule = { field: string; op: string; value?: string | number | boolean | null };
export type Segment = { id: string; name: string; filters: { match: "all" | "any"; rules: SegmentRule[] }; count: number; created_at: string };
export const segments = {
  list: () => request<Segment[]>("/segments"),
  create: (b: { name: string; filters: Segment["filters"] }) => request<Segment>("/segments", { method: "POST", body: b }),
  update: (id: string, b: { name: string; filters: Segment["filters"] }) => request<Segment>(`/segments/${id}`, { method: "PUT", body: b }),
  preview: (filters: Segment["filters"]) => request<{ count: number }>("/segments/preview", { method: "POST", body: filters }),
  remove: (id: string) => request<void>(`/segments/${id}`, { method: "DELETE" }),
};

// ---- flows ------------------------------------------------------------------------------------------------------------------------------------------------

export type FlowNode = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };
export type FlowSummary = { id: string; name: string; trigger_type: string; status: "draft" | "published" | "archived"; version: number; conversations_sent: number; updated_at: string; node_count: number; has_unpublished_changes: boolean };
export type FlowFull = FlowSummary & { graph: FlowGraph; errors?: string[] };
export type FlowExecution = { id: string; status: string; current_node: string | null; contact: { id: string; name: string; username: string | null; phone: string | null }; error: string | null; wait_until: string | null; created_at: string };
export const flows = {
  list: () => request<FlowSummary[]>("/flows"),
  create: (b: { name: string; trigger_type: string; graph?: FlowGraph }) => request<FlowFull>("/flows", { method: "POST", body: b }),
  get: (id: string) => request<FlowFull>(`/flows/${id}`),
  save: (id: string, b: { name?: string; trigger_type?: string; graph?: FlowGraph }) => request<FlowFull>(`/flows/${id}`, { method: "PUT", body: b }),
  publish: (id: string) => request<FlowFull>(`/flows/${id}/publish`, { method: "POST" }),
  unpublish: (id: string) => request<FlowFull>(`/flows/${id}/unpublish`, { method: "POST" }),
  duplicate: (id: string) => request<FlowFull>(`/flows/${id}/duplicate`, { method: "POST" }),
  remove: (id: string) => request<void>(`/flows/${id}`, { method: "DELETE" }),
  run: (id: string, b: { contact_id: string }) => request<{ execution_id: string; status: string }>(`/flows/${id}/run`, { method: "POST", body: b }),
  executions: (id: string) => request<FlowExecution[]>(`/flows/${id}/executions`),
  execution: (id: string, eid: string) => request<{ id: string; status: string; context: Record<string, unknown>; events: { at: string; node: string; type: string; detail: string }[]; error: string | null }>(`/flows/${id}/executions/${eid}`),
};

// ---- replies & settings ---------------------------------------------------------------------------------------------------------------------------------------

export type CustomReply = { id: string; trigger: string; match_type: "exact" | "contains" | "any"; reply_text: string; flow_id: string | null; priority: number; enabled: boolean; conversations_sent: number };
export const customReplies = {
  list: () => request<CustomReply[]>("/custom-replies"),
  create: (b: { trigger: string; match_type: string; reply_text: string; flow_id?: string | null; priority?: number }) => request<CustomReply>("/custom-replies", { method: "POST", body: b }),
  update: (id: string, b: Partial<{ trigger: string; match_type: string; reply_text: string; flow_id: string | null; priority: number; enabled: boolean }>) => request<CustomReply>(`/custom-replies/${id}`, { method: "PATCH", body: b }),
  remove: (id: string) => request<void>(`/custom-replies/${id}`, { method: "DELETE" }),
};
export const getSettings = () => request<{ settings: Record<string, unknown> }>("/settings");
export const patchSettings = (settings: Record<string, unknown>) => request<{ settings: Record<string, unknown> }>("/settings", { method: "PATCH", body: { settings } });

// ---- AI ------------------------------------------------------------------------------------------------------------------------------------------------------------

export type AiConfig = {
  enabled: boolean; agent_type: "support" | "leads" | "sales"; business_name: string; persona_name: string; tone: string; language: string; instructions: string;
  handoff_keywords: string[]; handoff_message: string; fallback_message: string; qualification_fields: string[]; min_confidence: number; model: string;
  has_own_key: boolean; api_key_hint: string; platform_key_available: boolean; usage_this_month: number; included_replies?: number | null;
};
export type KnowledgeSource = { id: string; kind: "text" | "faq" | "url"; title: string; source_url: string | null; status: string; error: string | null; chunk_count: number; created_at: string };
export const ai = {
  config: () => request<AiConfig>("/ai/config"),
  saveConfig: (b: Partial<AiConfig> & { api_key?: string | null }) => request<AiConfig>("/ai/config", { method: "PUT", body: b }),
  sources: () => request<KnowledgeSource[]>("/ai/knowledge"),
  addText: (title: string, content: string) => request<KnowledgeSource>("/ai/knowledge/text", { method: "POST", body: { title, content } }),
  addFaq: (items: { question: string; answer: string }[]) => request<KnowledgeSource>("/ai/knowledge/faq", { method: "POST", body: { items } }),
  addUrl: (url: string, crawl: boolean) => request<KnowledgeSource>("/ai/knowledge/url", { method: "POST", body: { url, crawl } }),
  chunks: (id: string) => request<string[]>(`/ai/knowledge/${id}/chunks`),
  removeSource: (id: string) => request<void>(`/ai/knowledge/${id}`, { method: "DELETE" }),
  test: (question: string) => request<{ reply: string; handoff: boolean; confidence: number; collected: Record<string, string>; sources: string[] }>("/ai/test", { method: "POST", body: { question } }),
};

// ---- developer & integrations ------------------------------------------------------------------------------------------------------------------------------------------

export type ApiKeyRow = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked: boolean; key?: string };
export type WebhookRow = { id: string; url: string; events: string[]; enabled: boolean; failure_count: number; last_status: string | null; last_delivery_at: string | null; secret?: string };
export const developer = {
  keys: () => request<ApiKeyRow[]>("/developer/keys"),
  createKey: (name: string) => request<ApiKeyRow>("/developer/keys", { method: "POST", body: { name } }),
  revokeKey: (id: string) => request<void>(`/developer/keys/${id}`, { method: "DELETE" }),
  events: () => request<string[]>("/developer/webhook-events"),
  webhooks: () => request<WebhookRow[]>("/developer/webhooks"),
  createWebhook: (b: { url: string; events: string[] }) => request<WebhookRow>("/developer/webhooks", { method: "POST", body: b }),
  updateWebhook: (id: string, b: { url: string; events: string[]; enabled: boolean }) => request<WebhookRow>(`/developer/webhooks/${id}`, { method: "PUT", body: b }),
  secret: (id: string) => request<{ secret: string }>(`/developer/webhooks/${id}/secret`),
  testWebhook: (id: string) => request<{ ok: boolean; detail: string }>(`/developer/webhooks/${id}/test`, { method: "POST" }),
  removeWebhook: (id: string) => request<void>(`/developer/webhooks/${id}`, { method: "DELETE" }),
};
export type AdapterMeta = { mode: "events" | "notify" | "generic"; secret_label: string; events: string[]; steps: string[] };
export type IntegrationRow = { provider: string; kind: string; status: string; config: { events?: string[] }; has_secret: boolean; last_event_at: string | null; last_error: string | null; hook_url?: string };
export const integrations = {
  adapters: () => request<Record<string, AdapterMeta>>("/integrations/adapters"),
  list: () => request<IntegrationRow[]>("/integrations"),
  save: (provider: string, b: { secret?: string; actions?: Record<string, unknown>; events?: string[] }) => request<IntegrationRow>(`/integrations/${provider}`, { method: "PUT", body: b }),
  rotate: (provider: string) => request<IntegrationRow>(`/integrations/${provider}/rotate-url`, { method: "POST" }),
  slackTest: () => request<{ ok: boolean }>("/integrations/slack/test", { method: "POST" }),
  remove: (provider: string) => request<void>(`/integrations/${provider}`, { method: "DELETE" }),
};

// ---- team, workspace, analytics ---------------------------------------------------------------------------------------------------------------------------------------------

export type Member = { user_id: string; email: string; full_name: string | null; role: string; is_you: boolean; active: boolean; last_login_at: string | null };
export type Invite = { id: string; email: string; role: string; expires_at: string; expired: boolean; email_sent?: boolean; invite_link?: string | null };
export const team = {
  members: () => request<Member[]>("/team/members"),
  setRole: (id: string, role: string) => request<{ role: string }>(`/team/members/${id}`, { method: "PATCH", body: { role } }),
  remove: (id: string) => request<void>(`/team/members/${id}`, { method: "DELETE" }),
  invites: () => request<Invite[]>("/team/invites"),
  invite: (email: string, role: string) => request<Invite>("/team/invites", { method: "POST", body: { email, role } }),
  revoke: (id: string) => request<void>(`/team/invites/${id}`, { method: "DELETE" }),
  inviteInfo: (token: string) => request<{ email: string; role: string; workspace: string; account_exists: boolean }>(`/team/invite/${encodeURIComponent(token)}`, { auth: false }),
  accept: (token: string, b: { full_name: string; password: string }) => request<AuthResponse>(`/team/invite/${encodeURIComponent(token)}/accept`, { method: "POST", auth: false, body: b }),
};
export type ApiPlan = { id: string; name: string; price_monthly: number | null; price_quarterly: number | null; price_yearly: number | null; is_default_trial: boolean; quotas: Record<string, number> };
export type ApiWorkspaceDetail = {
  id: string; name: string; slug: string; plan: ApiPlan; quotas: Record<string, number>; usage: { contacts: number; automation_flows: number; team_members: number };
  trial_ends_at: string | null; members: { user_id: string; email: string; full_name: string | null; role: string }[]; my_role: string | null;
};
export const getWorkspaceDetail = () => request<ApiWorkspaceDetail>("/workspace");
export const updateWorkspaceName = (name: string) => request<ApiWorkspaceDetail>("/workspace", { method: "PATCH", body: { name } });
export const listPlans = () => request<ApiPlan[]>("/plans");

export type Analytics = {
  days: number; messages: { date: string; inbound: number; outbound: number }[]; conversations_started: { date: string; count: number }[]; new_contacts: { date: string; count: number }[];
  delivery: { sent: number; delivered: number; read: number; failed: number; delivered_pct: number; read_pct: number; failed_pct: number };
  first_response: { avg_seconds: number | null; conversations: number }; conversations: { open: number; resolved: number; human_handled: number; unassigned: number };
  agents: { user_id: string; name: string; messages: number; conversations: number }[];
  comments: { received: number; matched: number; public_replies: number; dms_sent: number; failed: number; series: { date: string; comments: number; dms: number }[] };
  top_posts: { media_id: string; comments: number; matched: number; dms: number; caption: string | null; thumbnail_url: string | null; permalink: string | null }[];
  links: { sent: number; clicks: number; clicked: number };
  contacts: { total: number; opted_out: number };
};
export type NotificationItem = { id: string; type: "error" | "warning" | "success"; title: string; detail: string; href: string; at: string };
export const analytics = {
  overview: (days: number) => request<Analytics>(`/analytics/overview${qs({ days })}`),
  notifications: () => request<{ unread_messages: number; unread_conversations: number; items: NotificationItem[] }>("/notifications"),
};

// ---- sales pipeline ---------------------------------------------------------------------------------------------------------------------------------------------------------------

export type PipelineStage = { id: string; name: string; position: number; color: string; kind: "open" | "won" | "lost"; probability: number };
export type Deal = {
  id: string; title: string; value: number; currency: string; status: "open" | "won" | "lost"; stage_id: string; position: number; source: string;
  contact_id: string | null; contact_name: string | null; contact_phone: string | null; owner_user_id: string | null; owner_name: string | null;
  expected_close: string | null; lost_reason: string | null; notes: string | null; closed_at: string | null; created_at: string | null; updated_at: string | null;
};
export type DealActivity = { id: string; kind: string; data: Record<string, unknown>; user: string | null; created_at: string };
export type DealDetail = Deal & { activity: DealActivity[] };
export type PipelineBoard = { stages: (PipelineStage & { count: number; value: number; deals: Deal[] })[] };
export type DealInput = { title: string; stage_id?: string | null; contact_id?: string | null; value?: number; currency?: string; owner_user_id?: string | null; expected_close?: string | null; notes?: string | null };
export type PipelineReport = {
  days: number; open: { count: number; value: number; weighted: number }; created: number; won: { count: number; value: number; avg_value: number }; lost: { count: number; value: number };
  win_rate: number | null; avg_cycle_days: number | null; series: { date: string; won_value: number; won_count: number }[];
  funnel: { stage: string; color: string; kind: string; count: number }[]; by_owner: { user_id: string | null; name: string; won_count: number; won_value: number }[];
  lost_reasons: { reason: string; count: number }[]; won_sources: { source: string; count: number }[];
};
export const pipeline = {
  stages: () => request<PipelineStage[]>("/pipeline/stages"),
  addStage: (b: { name: string; color?: string; kind?: string; probability?: number }) => request<PipelineStage>("/pipeline/stages", { method: "POST", body: b }),
  updateStage: (id: string, b: Partial<Pick<PipelineStage, "name" | "color" | "kind" | "probability">>) => request<PipelineStage>(`/pipeline/stages/${id}`, { method: "PATCH", body: b }),
  reorderStages: (ids: string[]) => request<PipelineStage[]>("/pipeline/stages/order", { method: "PUT", body: { ids } }),
  deleteStage: (id: string, moveTo?: string) => request<void>(`/pipeline/stages/${id}${qs({ move_to: moveTo })}`, { method: "DELETE" }),
  board: (p?: { owner?: string; q?: string }) => request<PipelineBoard>(`/pipeline/board${qs(p)}`),
  deals: (p?: { status?: string; owner?: string; q?: string; contact_id?: string; limit?: number; offset?: number }) => request<Page<Deal>>(`/pipeline/deals${qs(p)}`),
  deal: (id: string) => request<DealDetail>(`/pipeline/deals/${id}`),
  create: (b: DealInput) => request<DealDetail>("/pipeline/deals", { method: "POST", body: b }),
  update: (id: string, b: Partial<DealInput> & { lost_reason?: string | null }) => request<DealDetail>(`/pipeline/deals/${id}`, { method: "PATCH", body: b }),
  move: (id: string, b: { stage_id: string; position?: number; lost_reason?: string }) => request<DealDetail>(`/pipeline/deals/${id}/move`, { method: "POST", body: b }),
  note: (id: string, text: string) => request<DealDetail>(`/pipeline/deals/${id}/notes`, { method: "POST", body: { text } }),
  remove: (id: string) => request<void>(`/pipeline/deals/${id}`, { method: "DELETE" }),
  report: (days: number) => request<PipelineReport>(`/pipeline/report${qs({ days })}`),
  exportCsv: () => downloadFile("/pipeline/export.csv", "deals.csv"),
};

// ---- billing (Razorpay) & payment links -------------------------------------------------------------------------------------------------------------------------------------------

export type BillingInterval = "monthly" | "quarterly" | "yearly";
export type BillingQuote = {
  plan_id: string; plan_name: string; interval: BillingInterval; months: number; currency: string; per_month: number; base: number; credit: number; taxable: number; gst: number;
  gst_percent: number; total: number; starts_at: string; ends_at: string; renewal: boolean;
};
export type BillingProfile = { legal_name: string; gstin: string; address: string; city: string; state_code: string; pincode: string; email: string; phone: string };
export type BillingPayment = {
  id: string; plan_id: string; interval: string; months: number; currency: string; base_amount: number; credit_amount: number; gst_amount: number; total_amount: number; status: string;
  invoice_number: string | null; method: string | null; paid_at: string | null; period_start: string | null; period_end: string | null; created_at: string | null;
};
export type BillingOverview = {
  enabled: boolean; key_id: string | null; currency: string; gst_percent: number;
  plan: { id: string } & PlanState;
  plans: { id: string; name: string; quotas: Record<string, number>; purchasable: boolean; current: boolean; per_month: Record<BillingInterval, number | null>; quotes: Partial<Record<BillingInterval, BillingQuote>> }[];
  profile: BillingProfile; states: Record<string, string>; seller: { name: string; gstin: string; address: string; email: string }; payments: BillingPayment[];
};
export type BillingCheckout = { payment_id: string; order_id: string; key_id: string; amount: number; currency: string; name: string; description: string; prefill: { name: string; email: string; contact: string } };
export type Invoice = {
  number: string | null; date: string; status: string; currency: string; seller: { name: string; gstin: string; address: string; email: string; state: string };
  buyer: Partial<BillingProfile> & { state: string }; place_of_supply: string; line: { description: string; sac: string; period_start: string | null; period_end: string | null };
  amounts: { base: number; credit: number; taxable: number; gst_percent: number; cgst: number; sgst: number; igst: number; gst: number; total: number }; razorpay_payment_id: string | null; method: string | null;
};
export const billing = {
  overview: () => request<BillingOverview>("/billing"),
  saveProfile: (b: BillingProfile) => request<BillingProfile>("/billing/profile", { method: "PUT", body: b }),
  quote: (plan_id: string, interval: BillingInterval) => request<BillingQuote>("/billing/quote", { method: "POST", body: { plan_id, interval } }),
  checkout: (plan_id: string, interval: BillingInterval) => request<BillingCheckout>("/billing/checkout", { method: "POST", body: { plan_id, interval } }),
  verify: (b: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => request<{ ok: boolean; payment: BillingPayment }>("/billing/verify", { method: "POST", body: b }),
  invoice: (id: string) => request<Invoice>(`/billing/invoices/${id}`),
};
export type PaymentsStatus = { connected: boolean; key_id: string | null; test_mode: boolean; connected_at: string | null };
export type PaymentLink = { id: string; short_url: string; amount: number; currency: string; description: string | null; status: "created" | "paid" | "cancelled" | "expired"; contact_id: string | null; contact_name: string | null; deal_id: string | null; paid_at: string | null; created_at: string | null };
export const payments = {
  settings: () => request<PaymentsStatus>("/payments/settings"),
  connect: (key_id: string, key_secret: string) => request<PaymentsStatus>("/payments/settings", { method: "PUT", body: { key_id, key_secret } }),
  disconnect: () => request<void>("/payments/settings", { method: "DELETE" }),
  links: (p?: { contact_id?: string; deal_id?: string }) => request<PaymentLink[]>(`/payments/links${qs(p)}`),
  createLink: (b: { amount: number; description?: string; contact_id?: string | null; deal_id?: string | null; currency?: string; expire_days?: number }) => request<PaymentLink>("/payments/links", { method: "POST", body: b }),
  refreshLink: (id: string) => request<PaymentLink>(`/payments/links/${id}/refresh`, { method: "POST" }),
  cancelLink: (id: string) => request<PaymentLink>(`/payments/links/${id}/cancel`, { method: "POST" }),
};

// ---- public marketing-site forms (no login) ---------------------------------------------------------------------------------------------------------------------------------------

export const site = {
  contact: (b: { topic: string; name: string; email: string; phone?: string; company?: string; message: string; page?: string; website?: string }) => request<{ ok: boolean }>("/site/contact", { method: "POST", auth: false, body: b }),
  newsletter: (email: string, source: string, website?: string) => request<{ ok: boolean }>("/site/newsletter", { method: "POST", auth: false, body: { email, source, website } }),
};


// ---- platform admin console -------------------------------------------------------------------------------------------------------------------

export type AdminState = PlanState;
export type AdminWorkspaceRow = {
  id: string; name: string; slug: string; status: "active" | "suspended"; plan_id: string; plan_name: string; trial_ends_at: string | null; plan_expires_at: string | null;
  created_at: string | null; owner_email: string | null; members: number; state: AdminState;
};
export type AdminWorkspaceDetail = AdminWorkspaceRow & {
  quotas: Record<string, number>; quotas_override: Record<string, number>; features: Record<string, boolean>;
  usage: { contacts: number; automation_flows: number; team_members: number; instagram_accounts: number };
  members: { user_id: string; email: string; full_name: string | null; role: string; last_login_at: string | null; is_active: boolean }[];
  payments: { id: string; plan_id: string; months: number; total_amount: number; invoice_number: string | null; paid_at: string | null }[];
};
export type AdminOverview = {
  workspaces: { total: number; by_plan: Record<string, number>; suspended: number; trial_active: number; trial_expiring_3d: number; paying: number };
  signups: { last_7d: number; last_30d: number }; users: number;
  revenue: { currency: string; mrr: number; last_30_days: number; all_time: number };
  recent_workspaces: AdminWorkspaceRow[];
  recent_payments: { id: string; workspace: string; plan_id: string; months: number; total_amount: number; invoice_number: string | null; paid_at: string | null }[];
};
export type AdminPlan = {
  id: string; name: string; price_monthly: number | null; price_quarterly: number | null; price_yearly: number | null; quotas: Record<string, number>;
  features: Record<string, boolean>; is_public: boolean; workspaces: number; purchasable: boolean;
};
export type AdminPlans = { plans: AdminPlan[]; feature_catalog: Record<string, { label: string; blurb: string }>; quota_keys: string[]; trial_days: number };
export type AdminPayment = {
  id: string; workspace_id: string; workspace: string; plan_id: string; interval: string; months: number; base_amount: number; gst_amount: number; total_amount: number;
  method: string | null; invoice_number: string | null; paid_at: string | null;
};
export type AdminUser = { id: string; email: string; full_name: string | null; is_active: boolean; created_at: string | null; last_login_at: string | null; workspaces: { name: string; role: string }[] };
export type AdminWorkspacePatch = {
  plan_id?: string; status?: "active" | "suspended"; extend_trial_days?: number; trial_ends_at?: string; plan_expires_at?: string; clear_plan_expiry?: boolean; quotas_override?: Record<string, number>;
};
export type AdminPlanPatch = {
  name?: string; price_monthly?: number; price_quarterly?: number; price_yearly?: number; clear_prices?: boolean; quotas?: Record<string, number>; features?: Record<string, boolean>; is_public?: boolean;
};
export const admin = {
  overview: () => request<AdminOverview>("/admin/overview"),
  workspaces: (p?: { q?: string; plan?: string; status?: string; limit?: number; offset?: number }) => request<{ total: number; items: AdminWorkspaceRow[] }>(`/admin/workspaces${qs(p)}`),
  workspace: (id: string) => request<AdminWorkspaceDetail>(`/admin/workspaces/${id}`),
  updateWorkspace: (id: string, body: AdminWorkspacePatch) => request<AdminWorkspaceDetail>(`/admin/workspaces/${id}`, { method: "PATCH", body }),
  plans: () => request<AdminPlans>("/admin/plans"),
  updatePlan: (id: string, body: AdminPlanPatch) => request<AdminPlan>(`/admin/plans/${id}`, { method: "PUT", body }),
  setTrialDays: (trial_days: number) => request<{ trial_days: number }>("/admin/settings", { method: "PUT", body: { trial_days } }),
  payments: (p?: { limit?: number; offset?: number }) => request<{ total: number; items: AdminPayment[] }>(`/admin/payments${qs(p)}`),
  users: (p?: { q?: string; limit?: number; offset?: number }) => request<{ total: number; items: AdminUser[] }>(`/admin/users${qs(p)}`),
  updateUser: (id: string, is_active: boolean) => request<{ id: string; is_active: boolean }>(`/admin/users/${id}`, { method: "PATCH", body: { is_active } }),
};

// ---- content: scheduled posts & insights -------------------------------------------------------------------------

export type PostKind = "image" | "carousel" | "reel" | "story";
/** A public link, or a media-library file (`asset_id`; the server fills in its link and size). */
export type PostMedia = { url: string; type: "image" | "video"; asset_id?: string; file?: string; width?: number | null; height?: number | null };
export type PostInput = { account_id: string; kind: PostKind; caption: string; media: PostMedia[]; first_comment: string; scheduled_at?: string | null; publish_now?: boolean };
export type ScheduledPost = PostInput & {
  id: string; account_username: string | null; scheduled_at: string; status: "scheduled" | "processing" | "published" | "failed" | "cancelled";
  ig_media_id: string | null; permalink: string | null; published_at: string | null; error: string | null; created_at: string | null;
};
export const posts = {
  list: (p?: { status?: string; start?: string; end?: string }) => request<ScheduledPost[]>(`/posts${qs(p)}`),
  create: (b: PostInput) => request<ScheduledPost>("/posts", { method: "POST", body: b }),
  update: (id: string, b: PostInput) => request<ScheduledPost>(`/posts/${id}`, { method: "PUT", body: b }),
  reschedule: (id: string, scheduled_at: string) => request<ScheduledPost>(`/posts/${id}/reschedule`, { method: "POST", body: { scheduled_at } }),
  cancel: (id: string) => request<ScheduledPost>(`/posts/${id}/cancel`, { method: "POST" }),
  remove: (id: string) => request<void>(`/posts/${id}`, { method: "DELETE" }),
  limit: (account_id: string) => request<{ used: number; limit: number }>(`/posts/limit${qs({ account_id })}`),
};

export type MediaAsset = {
  id: string; kind: "image" | "video"; name: string; url: string; file_name: string; content_type: string; size: number;
  width: number | null; height: number | null; created_at: string | null;
};
export type MediaLibraryPage = { items: MediaAsset[]; total: number; used_bytes: number; quota_bytes: number; publicly_reachable: boolean };
export const mediaLibrary = {
  list: (p?: { kind?: "image" | "video"; limit?: number; offset?: number }) => request<MediaLibraryPage>(`/media${qs(p)}`),
  upload: (files: File[]) => {
    const f = new FormData();
    files.forEach((file) => f.append("files", file));
    return request<MediaAsset[]>("/media", { method: "POST", form: f });
  },
  remove: (id: string) => request<void>(`/media/${id}`, { method: "DELETE" }),
};

export type AccountInsights = {
  days: number; totals: Record<string, number>; follows: number; unfollows: number; reach_series: { date: string; reach: number }[];
  followers_count: number | null; media_count: number | null;
};
export type MediaInsight = {
  id: string; caption: string; media_type: string | null; media_product_type: string | null; thumbnail_url: string | null; permalink: string | null;
  timestamp: string | null; like_count: number | null; comments_count: number | null; metrics: Record<string, number>;
};
export const insightsApi = {
  account: (account_id: string, days: number) => request<AccountInsights>(`/insights/account${qs({ account_id, days })}`),
  demographics: (account_id: string, breakdown: string) => request<{ breakdown: string; items: { label: string; value: number }[] }>(`/insights/demographics${qs({ account_id, breakdown })}`),
  media: (account_id: string) => request<{ items: MediaInsight[] }>(`/insights/media${qs({ account_id })}`),
};

// ---- growth tools: ig.me ref links, link-in-bio, AI copywriter ---------------------------------------------------------

export type RefLinkInput = { account_id: string; name: string; ref: string; enabled: boolean; message: string; buttons: { title: string; url: string }[]; tag: string; flow_id: string | null };
export type RefLink = RefLinkInput & { id: string; account_username: string; url: string; qr_url: string; opens: number; people: number; last_opened_at: string | null; created_at: string | null };
export type BioPageInput = { account_id: string; slug: string; title: string; bio: string; links: { title: string; url: string; clicks?: number }[]; dm_button_text: string; dm_ref_link_id: string | null; published: boolean };
export type BioPage = BioPageInput & { id: string; account_username: string; views: number; created_at: string | null };
export type PublicBioPage = { slug: string; title: string; bio: string; username: string; profile_picture_url: string | null; links: { title: string; index: number }[]; dm_button: { text: string; url: string } | null };
export const growth = {
  refLinks: () => request<RefLink[]>("/growth/ref-links"),
  createRefLink: (b: RefLinkInput) => request<RefLink>("/growth/ref-links", { method: "POST", body: b }),
  updateRefLink: (id: string, b: RefLinkInput) => request<RefLink>(`/growth/ref-links/${id}`, { method: "PUT", body: b }),
  removeRefLink: (id: string) => request<void>(`/growth/ref-links/${id}`, { method: "DELETE" }),
  bioPages: () => request<BioPage[]>("/growth/bio-pages"),
  createBioPage: (b: BioPageInput) => request<BioPage>("/growth/bio-pages", { method: "POST", body: b }),
  updateBioPage: (id: string, b: BioPageInput) => request<BioPage>(`/growth/bio-pages/${id}`, { method: "PUT", body: b }),
  removeBioPage: (id: string) => request<void>(`/growth/bio-pages/${id}`, { method: "DELETE" }),
  publicBio: (slug: string) => request<PublicBioPage>(`/public/bio/${encodeURIComponent(slug)}`, { auth: false }),
  bioLinkUrl: (slug: string, index: number) => `${API_URL}/public/bio/${encodeURIComponent(slug)}/go/${index}`,
};
export const aiWrite = (purpose: "dm" | "public_reply" | "caption", brief: string) =>
  request<{ options: string[] }>("/ai/write", { method: "POST", body: { purpose, brief } });
