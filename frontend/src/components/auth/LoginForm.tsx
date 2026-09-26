"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock } from "lucide-react";
import FormField from "./FormField";
import GoogleSignInButton from "./GoogleSignInButton";
import { ApiError, login, safeNextPath, storeSession } from "@/lib/api";
import { getEmailError, getPasswordError } from "@/lib/validation";

type Touched = { email?: boolean; password?: boolean };

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [touched, setTouched] = useState<Touched>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reset") === "1") setNotice("Password updated — sign in with your new password.");
  }, []);

  const errors = {
    email: getEmailError(email),
    password: getPasswordError(password),
  };
  const hasErrors = Boolean(errors.email || errors.password);

  const markTouched = (field: keyof Touched) => setTouched((t) => ({ ...t, [field]: true }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (hasErrors) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const auth = await login({ email, password });
      storeSession(auth);
      if (auth.must_rotate_password) {
        router.push("/rotate-password");
      } else {
        router.push(safeNextPath() ?? "/dashboard");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white sm:text-[28px]">
          Welcome to <span className="text-brand">GramForGrow</span>
        </h1>
        <p className="mt-2 text-[14px] text-white/50">
          Automate Instagram comments, DMs and story replies — with your whole team in one inbox.
        </p>
      </div>

      <FormField
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        onBlur={() => markTouched("email")}
        error={errors.email}
        touched={touched.email}
        placeholder="you@company.com"
        autoComplete="email"
        icon={<Mail className="h-4 w-4" />}
      />

      <FormField
        id="password"
        label="Password"
        value={password}
        onChange={setPassword}
        onBlur={() => markTouched("password")}
        error={errors.password}
        touched={touched.password}
        placeholder="Enter your password"
        autoComplete="current-password"
        icon={<Lock className="h-4 w-4" />}
        showPasswordToggle
        rightSlot={
          <Link href="/forgot-password" className="text-[12.5px] font-medium text-brand hover:text-brand-soft">
            Forgot password?
          </Link>
        }
      />

      {notice && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-[12.5px] text-pink-300">{notice}</p>
      )}
      {submitError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{submitError}</p>}

      <label className="flex items-center gap-2 text-[13.5px] text-white/60">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/5 text-brand focus:ring-brand"
        />
        Keep me logged in
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-[14.5px] font-semibold text-white transition-opacity hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Logging in…" : "Log in"}
      </button>

      <GoogleSignInButton mode="login" />
    </form>
  );
}
