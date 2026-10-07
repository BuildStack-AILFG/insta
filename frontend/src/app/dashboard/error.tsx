"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, EmptyState, Page } from "@/components/ui/kit";

// Catches a crash in any dashboard page, so the sidebar and top bar stay usable instead of the whole app going blank.
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Page>
      <EmptyState
        icon={<AlertTriangle size={20} />}
        title="Something went wrong on this page"
        body={`Try again, or go back to the dashboard. If it keeps happening, contact support${error.digest ? ` and mention code ${error.digest}` : ""}.`}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => retry()}><RotateCw size={14} /> Try again</Button>
            <Link href="/dashboard" className="rounded-lg border border-white/10 px-4 py-2 text-[13.5px] font-medium text-white/80 hover:bg-white/[0.07]">Back to dashboard</Link>
          </div>
        }
      />
    </Page>
  );
}
