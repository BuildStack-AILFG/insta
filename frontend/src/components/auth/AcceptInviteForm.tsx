"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, User } from "lucide-react";
import FormField from "./FormField";
import { ApiError, storeSession, team } from "@/lib/api";
import { getConfirmPasswordError, getNameError, getSignupPasswordError } from "@/lib/validation";

export default function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<{ email: string; role: string; workspace: string; account_exists: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errors = { name: getNameError(name), password: getSignupPasswordError(password), confirm: getConfirmPasswordError(password, confirm) };

  useEffect(() => {
    if (!token) {
      setLoadError("This invitation link is missing its token.");
      return;
    }
    team.inviteInfo(token).then(setInfo).catch((e) => setLoadError(e instanceof ApiError ? e.message : "Couldn't load this invitation."));
  }, [token]);

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-[26px] font-bold text-white">Invitation unavailable</h1>
        <p className="text-[14px] text-white/60">{loadError}</p>
        <Link href="/login" className="inline-block text-[14px] font-semibold text-brand hover:underline">
          Go to log in
        </Link>
      </div>
    );
  }
  if (!info) return <p className="text-white/50">Loading invitation…</p>;
  if (info.account_exists) {
    return (
      <div className="space-y-4">
        <h1 className="text-[26px] font-bold text-white">You already have an account</h1>
        <p className="text-[14px] text-white/60">
          {info.email} is already registered, and an account can currently belong to one workspace. Ask {info.workspace} to invite a different email address, or sign in to your existing account.
        </p>
        <Link href="/login" className="inline-block text-[14px] font-semibold text-brand hover:underline">
          Log in
        </Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, password: true, confirm: true });
    if (errors.name || errors.password || errors.confirm) return;
    setSubmitting(true);
    setError(null);
    try {
      storeSession(await team.accept(token, { full_name: name.trim(), password }));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white sm:text-[28px]">Join {info.workspace}</h1>
        <p className="mt-2 text-[14px] text-white/50">
          You&apos;ve been invited as <b className="text-white">{info.role}</b> ({info.email}). Create your account to get started.
        </p>
      </div>
      <FormField id="name" label="Full name" value={name} onChange={setName} onBlur={() => setTouched((t) => ({ ...t, name: true }))} error={errors.name} touched={touched.name} placeholder="Your name" autoComplete="name" icon={<User className="h-4 w-4" />} />
      <FormField id="password" label="Password" value={password} onChange={setPassword} onBlur={() => setTouched((t) => ({ ...t, password: true }))} error={errors.password} touched={touched.password} placeholder="Create a password" autoComplete="new-password" icon={<Lock className="h-4 w-4" />} showPasswordToggle />
      <FormField id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} onBlur={() => setTouched((t) => ({ ...t, confirm: true }))} error={errors.confirm} touched={touched.confirm} placeholder="Re-enter your password" autoComplete="new-password" icon={<Lock className="h-4 w-4" />} showPasswordToggle />
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-[14.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {submitting ? "Creating account…" : "Accept invitation"}
      </button>
    </form>
  );
}
