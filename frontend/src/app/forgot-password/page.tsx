import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password — GramForGrow" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell mode="login">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
