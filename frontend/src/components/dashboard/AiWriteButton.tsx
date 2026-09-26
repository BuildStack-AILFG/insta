"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Alert, Button, Field, Modal, Textarea } from "@/components/ui/kit";
import { aiWrite, ApiError, errorMessage } from "@/lib/api";

const TITLES = { dm: "Write the DM with AI", public_reply: "Write public replies with AI", caption: "Write a caption with AI" } as const;
const PLACEHOLDERS = {
  dm: "e.g. Send the serum price list, mention the combo offer, friendly tone, Hinglish",
  public_reply: "e.g. Tell them to check their DMs, playful",
  caption: "e.g. Launch of our vitamin C serum, ₹649, ask people to comment LINK",
} as const;

/** "✨ Write with AI": ask for a short brief, show three options, and hand the chosen one back. */
export default function AiWriteButton({ purpose, context, onPick, pickLabel = "Use this" }: {
  purpose: keyof typeof TITLES; context?: string; onPick: (text: string) => void; pickLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [options, setOptions] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; setup: boolean } | null>(null);

  const generate = async () => {
    setBusy(true); setErr(null);
    try { setOptions((await aiWrite(purpose, [brief.trim(), context?.trim()].filter(Boolean).join("\n\nContext: "))).options); }
    catch (e) { setErr({ text: errorMessage(e), setup: e instanceof ApiError && e.code === "ai_unavailable" }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setOptions(null); }} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-bright hover:underline">
        <Sparkles size={12} /> Write with AI
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={TITLES[purpose]} width={560}
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button><Button loading={busy} disabled={brief.trim().length < 3} onClick={generate}><Sparkles size={14} /> {options ? "Try again" : "Generate"}</Button></>}>
          {err && <Alert>{err.text}{err.setup && <> — <Link href="/dashboard/ai-agent" className="underline">set up AI</Link></>}</Alert>}
          <Field label="What should it say?"><Textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={PLACEHOLDERS[purpose]} autoFocus /></Field>
          {options && (
            <div className="mt-3 space-y-2">{options.map((o, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="whitespace-pre-wrap text-[13px] text-white/85">{o}</p>
                <div className="mt-2 flex justify-end"><Button size="sm" variant="ghost" onClick={() => { onPick(o); setOpen(false); }}>{pickLabel}</Button></div>
              </div>
            ))}</div>
          )}
        </Modal>
      )}
    </>
  );
}
