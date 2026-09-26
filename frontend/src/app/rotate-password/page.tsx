import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import RotatePasswordForm from "@/components/auth/RotatePasswordForm";

export const metadata: Metadata = {
  title: "Update your password — GramForGrow",
};

export default function RotatePasswordPage() {
  return (
    <AuthShell mode="login">
      <RotatePasswordForm />
    </AuthShell>
  );
}
