import Link from "next/link";
import { Compass } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-white/60">
        <Compass size={22} />
      </div>
      <h1 className="text-[20px] font-semibold text-white">This page doesn&apos;t exist</h1>
      <p className="mt-2 text-[13.5px] text-white/50">The link may be out of date. Head back to your dashboard to pick up where you left off.</p>
      <Link href="/dashboard" className="mt-6 rounded-lg bg-brand px-4 py-2 text-[13.5px] font-medium text-white hover:brightness-110">
        Back to dashboard
      </Link>
    </div>
  );
}
