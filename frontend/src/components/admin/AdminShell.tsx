"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import AuthGuard from "@/components/dashboard/AuthGuard";
import { useWorkspace } from "@/components/dashboard/WorkspaceContext";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { UiProvider } from "@/components/ui/kit";

/** The platform admin console frame. Signed-out visitors go to login; signed-in non-admins see an ordinary "not found" page (the API answers 404 too). */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <UiProvider>
        <AdminGate>{children}</AdminGate>
      </UiProvider>
    </AuthGuard>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { is_platform_admin, email } = useWorkspace();
  if (!is_platform_admin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
        <p className="text-[64px] font-extrabold leading-none text-white/20">404</p>
        <p className="text-[15px] text-white/60">This page could not be found.</p>
        <Link href="/dashboard" className="mt-2 rounded-lg bg-brand px-4 py-2 text-[13.5px] font-medium text-white hover:brightness-110">Go to your dashboard</Link>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 backdrop-blur-xl" style={{ backgroundColor: "color-mix(in srgb, var(--background) 85%, transparent)" }}>
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white btn-accent"><ShieldCheck size={16} /></span>
            <span className="text-[15px] font-semibold tracking-tight">GramForGrow <span className="font-normal text-white/50">Admin console</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[12.5px] text-white/45 sm:block">{email}</span>
            <ThemeToggle />
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-white/75 hover:bg-white/[0.06]"><ArrowLeft size={14} /> Dashboard</Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
