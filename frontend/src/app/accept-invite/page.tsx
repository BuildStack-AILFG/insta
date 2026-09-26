import { Suspense } from "react";
import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import AcceptInviteForm from "@/components/auth/AcceptInviteForm";

export const metadata: Metadata = { title: "Join your team — GramForGrow" };

export default function AcceptInvitePage() {
  return (
    <AuthShell mode="signup">
      <Suspense fallback={<p className="text-white/50">Loading…</p>}>
        <AcceptInviteForm />
      </Suspense>
    </AuthShell>
  );
}
