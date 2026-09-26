"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import FormField from "./FormField";
import { ApiError, resetPassword } from "@/lib/api";
import { getConfirmPasswordError, getSignupPasswordError } from "@/lib/validation";

export default function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errors = { password: getSignupPasswordError(password), confirm: getConfirmPasswordError(password, confirm) };

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="text-[26px] font-bold text-white">This link isn&apos;t valid</h1>
        <p className="text-[14px] text-white/60">The reset link is missing its token. Request a new one.</p>
        <Link href="/forgot-password" className="inline-block text-[14px] font-semibold text-brand hover:underline">
          Send a new link
        </Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    if (errors.password || errors.confirm) return;
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(token, password);
      router.push("/login?reset=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white sm:text-[28px]">Choose a new password</h1>
        <p className="mt-2 text-[14px] text-white/50">You&apos;ll be signed out everywhere and asked to log in with the new password.</p>
      </div>
      <FormField
        id="password"
        label="New password"
        value={password}
        onChange={setPassword}
        onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        error={errors.password}
        touched={touched.password}
        placeholder="Create a new password"
        autoComplete="new-password"
        icon={<Lock className="h-4 w-4" />}
        showPasswordToggle
      />
      <FormField
        id="confirm"
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
        onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
        error={errors.confirm}
        touched={touched.confirm}
        placeholder="Re-enter the password"
        autoComplete="new-password"
        icon={<Lock className="h-4 w-4" />}
        showPasswordToggle
      />
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">
          {error}{" "}
          <Link href="/forgot-password" className="underline">
            Request a new link
          </Link>
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-[14.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {submitting ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
