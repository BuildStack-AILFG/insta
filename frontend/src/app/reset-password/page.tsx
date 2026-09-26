import { Suspense } from "react";
import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password — GramForGrow" };

export default function ResetPasswordPage() {
  return (
    <AuthShell mode="login">
      <Suspense fallback={<p className="text-white/50">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
