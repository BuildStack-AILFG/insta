import type { Metadata } from "next";
import AuthGuard from "@/components/dashboard/AuthGuard";
import Sidebar from "@/components/dashboard/Sidebar";
import { RouteGate } from "@/components/dashboard/UpgradeGate";
import TopBar from "@/components/dashboard/TopBar";
import { UiProvider } from "@/components/ui/kit";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <UiProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-black text-white">
          <TopBar />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-y-auto"><RouteGate>{children}</RouteGate></main>
          </div>
        </div>
      </UiProvider>
    </AuthGuard>
  );
}
