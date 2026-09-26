"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import FormField from "./FormField";
import { ApiError, rotatePassword } from "@/lib/api";
import { getSignupPasswordError, getConfirmPasswordError } from "@/lib/validation";

export default function RotatePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const errors = {
    currentPassword: currentPassword ? undefined : "Enter your current password",
    newPassword: getSignupPasswordError(newPassword),
    confirm: getConfirmPasswordError(newPassword, confirm),
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ currentPassword: true, newPassword: true, confirm: true });
    if (hasErrors) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await rotatePassword({ currentPassword, newPassword });
      router.push("/dashboard");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white sm:text-[28px]">Update your password</h1>
        <p className="mt-2 text-[14px] text-white/50">
          Our password requirements have gotten stronger since you last set yours. Please choose a new one to continue.
        </p>
      </div>

      <FormField
        id="currentPassword"
        label="Current password"
        value={currentPassword}
        onChange={setCurrentPassword}
        onBlur={() => setTouched((t) => ({ ...t, currentPassword: true }))}
        error={errors.currentPassword}
        touched={touched.currentPassword}
        placeholder="Enter your current password"
        autoComplete="current-password"
        icon={<Lock className="h-4 w-4" />}
        showPasswordToggle
      />

      <FormField
        id="newPassword"
        label="New password"
        value={newPassword}
        onChange={setNewPassword}
        onBlur={() => setTouched((t) => ({ ...t, newPassword: true }))}
        error={errors.newPassword}
        touched={touched.newPassword}
        placeholder="Create a new password"
        autoComplete="new-password"
        icon={<Lock className="h-4 w-4" />}
        showPasswordToggle
      />

      <FormField
        id="confirm"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
        error={errors.confirm}
        touched={touched.confirm}
        placeholder="Re-enter your new password"
        autoComplete="new-password"
        icon={<Lock className="h-4 w-4" />}
        showPasswordToggle
      />

      {submitError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{submitError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-[14.5px] font-semibold text-white transition-opacity hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
