"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Card, Page, Spinner, useUi } from "@/components/ui/kit";
import { InstagramIcon } from "@/components/icons/BrandIcons";
import { errorMessage, instagram } from "@/lib/api";

/** Instagram sends people back here after they approve access (…/callback?code=…&state=…, or ?error=… if they cancel). */
export default function InstagramCallbackPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Finish />
    </Suspense>
  );
}

function Finish() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useUi();
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the code is single-use — never submit it twice (e.g. React strict-mode double effects)
    started.current = true;
    const code = params.get("code");
    const state = params.get("state");
    if (params.get("error")) {
      setErr(params.get("error_description") || "Instagram login was cancelled.");
      return;
    }
    if (!code || !state) {
      setErr("This page needs the code Instagram sends back after you approve access. Start again from the Instagram page.");
      return;
    }
    instagram.finishOauth(code, state)
      .then((a) => {
        toast(`@${a.username} connected`);
        (a.warnings ?? []).forEach((w) => toast(w, "error"));
        router.replace("/dashboard/instagram");
      })
      .catch((e) => setErr(errorMessage(e, "Couldn't finish connecting Instagram.")));
  }, [params, router, toast]);

  return (
    <Page>
      <Card className="mx-auto mt-10 max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-brand-bright"><InstagramIcon size={24} /></div>
        {err ? (
          <>
            <Alert>{err}</Alert>
            <Link href="/dashboard/instagram"><Button className="mt-4">Back to Instagram</Button></Link>
          </>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-white">Connecting your Instagram account…</p>
            <Spinner />
          </>
        )}
      </Card>
    </Page>
  );
}
