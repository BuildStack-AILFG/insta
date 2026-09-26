"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Target } from "lucide-react";
import { Alert, Card, Page, PageHeader, Spinner, Toggle, useUi } from "@/components/ui/kit";
import { ai, errorMessage, getSettings, patchSettings, type AiConfig } from "@/lib/api";

export default function IntentMatchingPage() {
  const { toast } = useUi();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getSettings().then((s) => setEnabled((s.settings.intent_matching_enabled as boolean | undefined) ?? false)).catch((e) => setErr(errorMessage(e)));
    ai.config().then(setCfg).catch(() => {});
  }, []);
  const usable = !!cfg && (cfg.has_own_key || cfg.platform_key_available);

  return (
    <Page>
      <PageHeader icon={<Target size={20} />} title="Intent matching" subtitle="When a message doesn't match any keyword, AI works out which of your custom replies the customer meant — “how much is it?” triggers your “price” reply." />
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      {enabled === null ? <Spinner /> : (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div><div className="text-[15px] font-semibold text-white">Match by meaning</div><p className="mt-1 max-w-xl text-[13px] text-white/55">Only used after exact and keyword matching fail, and only against replies you&apos;ve already written — it never invents answers. Uses one AI reply from your allowance per attempt.</p></div>
            <Toggle checked={enabled} disabled={!usable && !enabled} label="Intent matching" onChange={async (v) => { setEnabled(v); try { await patchSettings({ intent_matching_enabled: v }); toast(v ? "Intent matching is on" : "Intent matching is off"); } catch (e) { setEnabled(!v); setErr(errorMessage(e)); } }} />
          </div>
          {!usable && <div className="mt-4"><Alert tone="yellow">Needs an AI key. <Link href="/dashboard/ai-agent" className="underline">Add your Anthropic key in AI agent → Configuration</Link>.</Alert></div>}
          <div className="mt-2 text-[12.5px] text-white/40">Manage the replies it can choose from in <Link href="/dashboard/custom-replies" className="text-sky-300 underline">Custom replies</Link>.</div>
        </Card>
      )}
    </Page>
  );
}
