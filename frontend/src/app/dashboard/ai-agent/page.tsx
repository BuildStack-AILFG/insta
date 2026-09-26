"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Bot, Globe, Headphones, MessageSquare, Plus, ShoppingBag, Sparkles, Target, Trash2, X } from "lucide-react";
import { Alert, Badge, Button, Card, cx, EmptyState, Field, Input, Modal, Page, PageHeader, Spinner, statusTone, Tabs, Textarea, Toggle, useUi } from "@/components/ui/kit";
import { ai as api, errorMessage, type AiConfig, type KnowledgeSource } from "@/lib/api";

const AGENTS = [
  { id: "support", name: "Support agent", icon: Headphones, color: "#0F9D58", desc: "Answers customer questions from your knowledge base, day and night." },
  { id: "leads", name: "Leads agent", icon: Target, color: "#2563EB", desc: "Qualifies inbound leads by asking your questions one at a time and saving the answers." },
  { id: "sales", name: "Sales agent", icon: ShoppingBag, color: "#D97706", desc: "Recommends from your product info and guides people to a decision." },
] as const;

export default function AiAgentPage() {
  const [tab, setTab] = useState<"config" | "knowledge" | "test">("config");
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setCfg(await api.config()); } catch (e) { setError(errorMessage(e, "Couldn't load AI settings.")); } }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <Page>
      <PageHeader icon={<Bot size={20} />} title="AI agent" subtitle="An assistant that replies to Instagram DMs using only what you teach it, and hands over to your team when it isn't sure."
        actions={cfg && <Badge tone={cfg.enabled ? "green" : "gray"}>{cfg.enabled ? "Live" : "Off"}</Badge>} />
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      <Tabs tabs={[{ id: "config", label: "Configuration" }, { id: "knowledge", label: "Knowledge base" }, { id: "test", label: "Test" }]} value={tab} onChange={setTab} />
      {!cfg ? <Spinner /> : tab === "config" ? <Config cfg={cfg} onSaved={setCfg} /> : tab === "knowledge" ? <Knowledge /> : <Playground cfg={cfg} />}
    </Page>
  );
}

function Config({ cfg, onSaved }: { cfg: AiConfig; onSaved: (c: AiConfig) => void }) {
  const { toast } = useUi();
  const [f, setF] = useState({ ...cfg, keywords: cfg.handoff_keywords.join(", "), fields: cfg.qualification_fields.join(", "), api_key: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const save = async (enabled = f.enabled) => {
    setBusy(true); setErr(null);
    try {
      const saved = await api.saveConfig({ enabled, agent_type: f.agent_type, business_name: f.business_name, persona_name: f.persona_name, tone: f.tone, language: f.language, instructions: f.instructions,
        handoff_keywords: f.keywords.split(",").map((k) => k.trim()).filter(Boolean), handoff_message: f.handoff_message, fallback_message: f.fallback_message, qualification_fields: f.fields.split(",").map((k) => k.trim()).filter(Boolean),
        min_confidence: f.min_confidence, model: f.model, ...(f.api_key ? { api_key: f.api_key } : {}) });
      onSaved(saved); setF((p) => ({ ...p, enabled: saved.enabled, api_key: "" })); toast(saved.enabled ? "AI agent is live" : "Settings saved");
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const usage = cfg.included_replies != null && !cfg.has_own_key ? `${cfg.usage_this_month} of ${cfg.included_replies} included replies used this month` : `${cfg.usage_this_month} AI replies this month`;

  return (
    <div className="space-y-5">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div><div className="text-[15px] font-semibold text-white">Turn on the AI agent</div><div className="mt-0.5 text-[12.5px] text-white/50">It answers incoming messages when no flow or custom reply matches, and never talks over a human. {usage}.</div></div>
        <Toggle checked={f.enabled} disabled={busy} onChange={(v) => { set("enabled", v); void save(v); }} label="AI agent enabled" />
      </Card>

      <div className="grid gap-3 md:grid-cols-3">{AGENTS.map((a) => (
        <button key={a.id} onClick={() => set("agent_type", a.id)} className={cx("rounded-2xl border p-4 text-left transition", f.agent_type === a.id ? "border-brand bg-brand/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")}>
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${a.color}25`, color: a.color }}><a.icon size={18} /></div>
          <div className="text-[14px] font-semibold text-white">{a.name}</div><p className="mt-1 text-[12.5px] text-white/50">{a.desc}</p></button>))}</div>

      <Card className="space-y-4 p-5">
        <h3 className="text-[14px] font-semibold text-white">Personality</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name"><Input value={f.business_name} onChange={(e) => set("business_name", e.target.value)} /></Field>
          <Field label="Assistant name"><Input value={f.persona_name} onChange={(e) => set("persona_name", e.target.value)} placeholder="Aria" /></Field>
          <Field label="Tone"><Input value={f.tone} onChange={(e) => set("tone", e.target.value)} placeholder="friendly and professional" /></Field>
          <Field label="Language" hint="Leave as-is to reply in the customer's language"><Input value={f.language} onChange={(e) => set("language", e.target.value)} /></Field>
        </div>
        <Field label="Extra instructions" hint="Rules the assistant must follow, e.g. “Never quote prices; send people to the pricing page.”"><Textarea value={f.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={3000} /></Field>
        {f.agent_type === "leads" && <Field label="Details to collect" hint="Comma separated. Answers are saved on the contact."><Input value={f.fields} onChange={(e) => set("fields", e.target.value)} placeholder="budget, timeline, company_size" /></Field>}
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-[14px] font-semibold text-white">Handing over to your team</h3>
        <Field label="Hand over when the customer says (any of)" hint="Comma separated"><Input value={f.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="human, agent, complaint" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Message when handing over"><Textarea value={f.handoff_message} onChange={(e) => set("handoff_message", e.target.value)} className="!min-h-[72px]" /></Field>
          <Field label="Message when unsure (optional)" hint="Used when confidence is low; falls back to the hand-over message"><Textarea value={f.fallback_message} onChange={(e) => set("fallback_message", e.target.value)} className="!min-h-[72px]" /></Field>
        </div>
        <Field label={`Minimum confidence: ${Math.round(f.min_confidence * 100)}%`} hint="Below this the agent hands over instead of guessing. Higher = safer, more hand-overs."><input type="range" min={0} max={90} step={5} value={Math.round(f.min_confidence * 100)} onChange={(e) => set("min_confidence", Number(e.target.value) / 100)} className="w-full accent-brand" /></Field>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="text-[14px] font-semibold text-white">AI provider</h3>
        <p className="text-[12.5px] text-white/50">{cfg.platform_key_available ? "Your plan includes AI replies on our shared key. To go beyond the included amount, add your own Anthropic API key — usage then bills to your Anthropic account, not ours." : "Add your Anthropic API key to power the agent. Get one at console.anthropic.com."}</p>
        <Field label="Anthropic API key" hint={cfg.has_own_key ? `A key ending ${cfg.api_key_hint.slice(-4)} is saved (encrypted). Paste a new one to replace it.` : "Stored encrypted; never shown again."}>
          <Input type="password" value={f.api_key} onChange={(e) => set("api_key", e.target.value)} placeholder={cfg.has_own_key ? "••••••••••••" : "sk-ant-…"} autoComplete="off" /></Field>
        {cfg.has_own_key && <Button size="sm" variant="danger" onClick={async () => { try { onSaved(await api.saveConfig({ enabled: false, api_key: "" })); setF((p) => ({ ...p, enabled: false })); toast("Key removed and the agent was turned off"); } catch (e) { setErr(errorMessage(e)); } }}>Remove saved key</Button>}
      </Card>
      <div className="flex justify-end"><Button loading={busy} onClick={() => save()}>Save changes</Button></div>
    </div>
  );
}

function Knowledge() {
  const { toast, confirm } = useUi();
  const [list, setList] = useState<KnowledgeSource[] | null>(null);
  const [adding, setAdding] = useState<"text" | "faq" | "url" | null>(null);
  const [view, setView] = useState<{ s: KnowledgeSource; chunks: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setList(await api.sources()); } catch (e) { setError(errorMessage(e)); } }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setAdding("url")}><Globe size={14} /> Add website</Button>
        <Button variant="ghost" onClick={() => setAdding("faq")}><MessageSquare size={14} /> Add FAQs</Button>
        <Button variant="ghost" onClick={() => setAdding("text")}><BookOpen size={14} /> Paste text</Button>
      </div>
      {!list ? <Spinner /> : list.length === 0 ? <EmptyState icon={<BookOpen size={22} />} title="Teach your agent" body="Add your website, FAQs or any text about your products, prices, policies and hours. The agent only answers from what you add here." /> : (
        <div className="space-y-2">{list.map((s) => (
          <Card key={s.id} className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/60">{s.kind === "url" ? <Globe size={18} /> : s.kind === "faq" ? <MessageSquare size={18} /> : <BookOpen size={18} />}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium text-white">{s.title}</div><div className="text-[12px] text-white/40">{s.kind} · {s.chunk_count} passage{s.chunk_count === 1 ? "" : "s"}{s.source_url && ` · ${s.source_url}`}</div>{s.error && <div className="text-[12px] text-red-300">{s.error}</div>}</div>
            <Badge tone={statusTone(s.status)}>{s.status}</Badge>
            <Button size="sm" variant="ghost" onClick={async () => { try { setView({ s, chunks: await api.chunks(s.id) }); } catch (e) { toast(errorMessage(e), "error"); } }}>Preview</Button>
            <Button size="sm" variant="danger" aria-label="Delete" onClick={async () => { if (await confirm({ title: "Remove this source?", body: "The agent will stop using it immediately.", confirmLabel: "Remove", danger: true })) { try { await api.removeSource(s.id); await load(); toast("Source removed"); } catch (e) { toast(errorMessage(e), "error"); } } }}><Trash2 size={13} /></Button>
          </Card>))}</div>
      )}
      {adding && <AddSource kind={adding} onClose={() => setAdding(null)} onDone={(s) => { setAdding(null); toast(s.status === "failed" ? `Couldn't read that source: ${s.error}` : `Added ${s.chunk_count} passages`, s.status === "failed" ? "error" : "success"); void load(); }} />}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.s.title ?? ""} width={640}>{view?.chunks.map((c, i) => <p key={i} className="mb-3 whitespace-pre-wrap rounded-lg bg-white/[0.04] p-3 text-[12.5px] text-white/75">{c}</p>)}</Modal>
    </div>
  );
}

function AddSource({ kind, onClose, onDone }: { kind: "text" | "faq" | "url"; onClose: () => void; onDone: (s: KnowledgeSource) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [crawl, setCrawl] = useState(true);
  const [faqs, setFaqs] = useState([{ question: "", answer: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = kind === "text" ? title.trim() && content.trim().length >= 10 : kind === "url" ? url.trim().length > 7 : faqs.some((f) => f.question.trim() && f.answer.trim());
  const submit = async () => {
    setBusy(true); setErr(null);
    try { onDone(kind === "text" ? await api.addText(title, content) : kind === "url" ? await api.addUrl(url.trim(), crawl) : await api.addFaq(faqs.filter((f) => f.question.trim() && f.answer.trim()))); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={kind === "url" ? "Add a website" : kind === "faq" ? "Add FAQs" : "Paste text"} width={640} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!ready} onClick={submit}>{kind === "url" ? "Read website" : "Add"}</Button></>}>
      {err && <Alert>{err}</Alert>}
      {kind === "url" && <div className="space-y-3"><Field label="Page address" hint="Public pages only"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourbusiness.com/about" autoFocus /></Field>
        <label className="flex items-center gap-3 text-[13px] text-white/70"><Toggle checked={crawl} onChange={setCrawl} label="Follow links" /> Also read up to 7 linked pages on the same site</label></div>}
      {kind === "text" && <div className="space-y-3"><Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Return policy" autoFocus /></Field><Field label="Content"><Textarea value={content} onChange={(e) => setContent(e.target.value)} className="!min-h-[200px]" placeholder="Paste anything the agent should know…" /></Field></div>}
      {kind === "faq" && <div className="space-y-3">{faqs.map((f, i) => <div key={i} className="space-y-2 rounded-xl border border-white/10 p-3"><div className="flex gap-2"><Input value={f.question} onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} placeholder="Question" />{faqs.length > 1 && <button onClick={() => setFaqs(faqs.filter((_, j) => j !== i))} className="px-1 text-white/40 hover:text-red-300" aria-label="Remove"><X size={15} /></button>}</div>
        <Textarea value={f.answer} onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} placeholder="Answer" className="!min-h-[64px]" /></div>)}
        <Button size="sm" variant="ghost" onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}><Plus size={13} /> Add another</Button></div>}
    </Modal>
  );
}

function Playground({ cfg }: { cfg: AiConfig }) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; r: Awaited<ReturnType<typeof api.test>> | { error: string } }[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    const question = q.trim(); if (!question) return;
    setBusy(true); setQ("");
    try { const r = await api.test(question); setLog((l) => [...l, { q: question, r }]); } catch (e) { setLog((l) => [...l, { q: question, r: { error: errorMessage(e) } }]); } finally { setBusy(false); }
  };
  return (
    <Card className="p-5">
      <p className="mb-4 text-[13px] text-white/55">Ask the agent a question exactly as a customer would. Nothing is sent on Instagram{cfg.has_own_key || cfg.platform_key_available ? "" : " — add an API key in Configuration first"}.</p>
      <div className="mb-4 max-h-[420px] space-y-4 overflow-y-auto">{log.map((m, i) => (
        <div key={i}><div className="ml-auto w-fit max-w-[80%] theme-fixed rounded-2xl rounded-br-md bg-[#9d174d] px-3.5 py-2 text-[13.5px] text-white">{m.q}</div>
          {"error" in m.r ? <div className="mt-2"><Alert>{m.r.error}</Alert></div> : <div className="mt-2 max-w-[85%]"><div className="w-fit rounded-2xl rounded-bl-md bg-white/[0.08] px-3.5 py-2 text-[13.5px] whitespace-pre-wrap text-white">{m.r.reply}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-white/40"><Badge tone={m.r.confidence >= 0.6 ? "green" : "yellow"}>confidence {Math.round(m.r.confidence * 100)}%</Badge>{m.r.handoff && <Badge tone="blue">would hand over to a human</Badge>}{m.r.sources.length > 0 ? `${m.r.sources.length} knowledge passage(s) used` : "no knowledge matched"}</div></div>}</div>))}
        {log.length === 0 && <div className="py-10 text-center text-[13px] text-white/35"><Sparkles size={20} className="mx-auto mb-2" />Try “What are your opening hours?”</div>}</div>
      <div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Type a customer question…" disabled={busy} aria-label="Test question" /><Button loading={busy} onClick={ask} disabled={!q.trim()}>Ask</Button></div>
    </Card>
  );
}
