const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getNameError(value: string): string | undefined {
  if (!value.trim()) return "Full name is required";
  if (value.trim().length < 2) return "Enter your full name";
  return undefined;
}

export function getEmailError(value: string): string | undefined {
  if (!value.trim()) return "Email is required";
  if (!EMAIL_PATTERN.test(value.trim())) return "Enter a valid email address";
  return undefined;
}

export function getPasswordError(value: string, minLength = 6): string | undefined {
  if (!value) return "Password is required";
  if (value.length < minLength) return `Password must be at least ${minLength} characters`;
  return undefined;
}

export function getSignupPasswordError(value: string): string | undefined {
  if (!value) return "Password is required";
  if (value.length < 12) return "Use at least 12 characters";
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((rx) => rx.test(value)).length;
  if (classes < 3) {
    return "Include at least 3 of: uppercase, lowercase, number, symbol";
  }
  return undefined;
}

export function getConfirmPasswordError(password: string, confirm: string): string | undefined {
  if (!confirm) return "Please confirm your password";
  if (confirm !== password) return "Passwords do not match";
  return undefined;
}

export function getPasswordStrength(value: string): number {
  let score = 0;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return score;
}
