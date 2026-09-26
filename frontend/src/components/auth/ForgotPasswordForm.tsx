"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import FormField from "./FormField";
import { ApiError, forgotPassword } from "@/lib/api";
import { getEmailError } from "@/lib/validation";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailError = getEmailError(email);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (emailError) return;
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <h1 className="text-[26px] font-bold tracking-tight text-white">Check your email</h1>
        <p className="text-[14px] text-white/60">
          If an account exists for <b className="text-white">{email}</b>, we&apos;ve sent a link to reset your password. It expires in 1 hour.
        </p>
        <p className="text-[13px] text-white/40">Nothing arrived? Check spam, or try again in a few minutes.</p>
        <Link href="/login" className="inline-block text-[14px] font-semibold text-brand hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white sm:text-[28px]">Forgot your password?</h1>
        <p className="mt-2 text-[14px] text-white/50">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      </div>
      <FormField
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        onBlur={() => setTouched(true)}
        error={emailError}
        touched={touched}
        placeholder="you@company.com"
        autoComplete="email"
        icon={<Mail className="h-4 w-4" />}
      />
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-[14.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/login" className="block text-center text-[13.5px] text-white/60 hover:text-white">
        Back to log in
      </Link>
    </form>
  );
}
