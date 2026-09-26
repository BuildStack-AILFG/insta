"use client";

import { ReactNode, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type FormFieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  icon?: ReactNode;
  error?: string;
  touched?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
  rightSlot?: ReactNode;
  showPasswordToggle?: boolean;
};

export default function FormField({
  id,
  label,
  type = "text",
  value,
  placeholder,
  autoComplete,
  icon,
  error,
  touched,
  onChange,
  onBlur,
  rightSlot,
  showPasswordToggle,
}: FormFieldProps) {
  const [visible, setVisible] = useState(false);
  const resolvedType = showPasswordToggle ? (visible ? "text" : "password") : type;
  const showError = Boolean(touched && error);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[12px] font-semibold uppercase tracking-wide text-white/50">
          {label}
        </label>
        {rightSlot}
      </div>
      <div
        className={`flex items-center gap-2 rounded-xl border bg-white/[0.04] px-3.5 py-2.5 transition-colors ${
          showError
            ? "border-red-500/50 ring-1 ring-red-500/20"
            : "border-white/10 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
        }`}
      >
        {icon && <span className="shrink-0 text-white/40">{icon}</span>}
        <input
          id={id}
          name={id}
          type={resolvedType}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={showError}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
        />
        {showPasswordToggle && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="shrink-0 text-white/40 transition-colors hover:text-white/70"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {showError && <p className="mt-1.5 text-[12.5px] text-red-400">{error}</p>}
    </div>
  );
}
