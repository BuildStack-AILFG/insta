import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import AuthIllustration from "./AuthIllustration";

type AuthShellProps = {
  mode: "login" | "signup";
  children: ReactNode;
};

export default function AuthShell({ mode, children }: AuthShellProps) {
  const isLogin = mode === "login";

  return (
    <div className="flex min-h-screen w-full bg-black">
      <div className="flex w-full flex-col px-6 py-7 sm:px-10 lg:w-[46%] lg:px-16 lg:py-10 xl:px-20">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Image src="/logo-mark.png" alt="GramForGrow" width={30} height={30} className="rounded-lg" />
            <span className="landing-logo text-[17px] text-white">GramForGrow</span>
          </Link>
          <Link
            href={isLogin ? "/signup" : "/login"}
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] sm:inline-flex"
          >
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <span className="font-semibold text-brand">{isLogin ? "Sign up" : "Log in"}</span>
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10 sm:py-12 lg:mx-0">
          {children}
        </div>

        <div className="flex flex-col items-center gap-4 pt-4 text-center sm:hidden">
          <Link href={isLogin ? "/signup" : "/login"} className="text-[13.5px] text-white/60">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span className="font-semibold text-brand">{isLogin ? "Sign up" : "Log in"}</span>
          </Link>
        </div>

        <div className="pt-6 text-center text-[12px] text-white/30 lg:text-left">
          © {new Date().getFullYear()} GramForGrow. All rights reserved.
        </div>
      </div>

      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-black p-12 lg:flex xl:p-16">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-brand/10 blur-3xl" />
        <AuthIllustration />
      </div>
    </div>
  );
}
