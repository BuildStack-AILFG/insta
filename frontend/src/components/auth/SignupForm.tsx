"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Building2 } from "lucide-react";
import FormField from "./FormField";
import { ApiError, register, safeNextPath, storeSession } from "@/lib/api";
import GoogleSignInButton from "./GoogleSignInButton";
import {
  getNameError,
  getEmailError,
  getSignupPasswordError,
  getConfirmPasswordError,
  getPasswordStrength,
} from "@/lib/validation";

type Touched = { name?: boolean; companyName?: boolean; email?: boolean; password?: boolean; confirm?: boolean; agreed?: boolean };

const strengthLabels = ["Weak", "Weak", "Fair", "Good", "Strong"];
const strengthColors = ["bg-red-500", "bg-red-500", "bg-amber-400", "bg-brand-soft", "bg-brand"];

export default function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState<Touched>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const errors = {
    name: getNameError(name),
    companyName: companyName.trim() ? undefined : "Company name is required",
    email: getEmailError(email),
    password: getSignupPasswordError(password),
    confirm: getConfirmPasswordError(password, confirm),
    agreed: agreed ? undefined : "You must accept the Terms to continue",
  };
  const strength = getPasswordStrength(password);
  const hasErrors = Object.values(errors).some(Boolean);

  const markTouched = (field: keyof Touched) => setTouched((t) => ({ ...t, [field]: true }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, companyName: true, email: true, password: true, confirm: true, agreed: true });
    if (hasErrors) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const auth = await register({ companyName, fullName: name, email, password });
      storeSession(auth);
      router.push(safeNextPath() ?? "/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.passwordFailures?.[0]?.message ?? err.message);
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
          Create your <span className="text-brand">DMForGrow</span> account
        </h1>
        <p className="mt-2 text-[14px] text-white/50">
          Turn Instagram comments into DMs and leads in minutes. No credit card required.
        </p>
      </div>

      <FormField
        id="name"
        label="Full name"
        value={name}
        onChange={setName}
        onBlur={() => markTouched("name")}
        error={errors.name}
        touched={touched.name}
        placeholder="Jane Cooper"
        autoComplete="name"
        icon={<User className="h-4 w-4" />}
      />

      <FormField
        id="companyName"
        label="Company name"
        value={companyName}
        onChange={setCompanyName}
        onBlur={() => markTouched("companyName")}
        error={errors.companyName}
        touched={touched.companyName}
        placeholder="Acme Inc."
        autoComplete="organization"
        icon={<Building2 className="h-4 w-4" />}
      />

      <FormField
        id="email"
        label="Work email"
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

      <div>
        <FormField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          onBlur={() => markTouched("password")}
          error={errors.password}
          touched={touched.password}
          placeholder="Create a password"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          showPasswordToggle
        />
        {password.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i < strength ? strengthColors[strength] : "bg-white/10"}`}
                />
              ))}
            </div>
            <span className="text-[11.5px] font-medium text-white/50">{strengthLabels[strength]}</span>
          </div>
        )}
      </div>

      <FormField
        id="confirm"
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
        onBlur={() => markTouched("confirm")}
        error={errors.confirm}
        touched={touched.confirm}
        placeholder="Re-enter your password"
        autoComplete="new-password"
        icon={<Lock className="h-4 w-4" />}
        showPasswordToggle
      />

      <div>
        <label className="flex items-start gap-2.5 text-[13.5px] text-white/60">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              markTouched("agreed");
            }}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-brand focus:ring-brand"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium text-brand hover:text-brand-soft">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-brand hover:text-brand-soft">
              Privacy Policy
            </Link>
          </span>
        </label>
        {touched.agreed && errors.agreed && <p className="mt-1.5 text-[12.5px] text-red-400">{errors.agreed}</p>}
      </div>

      {submitError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{submitError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-[14.5px] font-semibold text-white transition-opacity hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Creating account…" : "Register"}
      </button>

      <GoogleSignInButton mode="signup" companyName={companyName} />
    </form>
  );
}
