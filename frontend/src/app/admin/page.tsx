"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, PageHeader, Spinner, Tabs } from "@/components/ui/kit";
import { LayoutDashboard } from "lucide-react";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminWorkspaces from "@/components/admin/AdminWorkspaces";
import AdminPlans from "@/components/admin/AdminPlans";
import { AdminPayments, AdminUsers } from "@/components/admin/AdminLists";

type TabId = "overview" | "workspaces" | "plans" | "payments" | "users";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "workspaces", label: "Workspaces" }, { id: "plans", label: "Plans & limits" }, { id: "payments", label: "Payments" }, { id: "users", label: "Users" },
];

export default function AdminPage() {
  return <Suspense fallback={<Spinner />}><Admin /></Suspense>;
}

function Admin() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab") as TabId | null;
  const [tab, setTabState] = useState<TabId>(TABS.some((t) => t.id === requested) ? (requested as TabId) : "overview");
  const [open, setOpen] = useState<string | null>(null); // workspace id to open in the Workspaces tab

  const goTab = (t: TabId) => { setTabState(t); router.replace(`/admin?tab=${t}`, { scroll: false }); };
  const setTab = (t: TabId) => { setOpen(null); goTab(t); }; // choosing a tab yourself never re-opens a workspace
  const openWorkspace = (id: string) => { setOpen(id); goTab("workspaces"); };

  return (
    <Page wide>
      <PageHeader icon={<LayoutDashboard size={20} />} title="Admin console" subtitle="Every workspace, plan, payment and user on the platform. Account and billing data only — never message content." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "overview" && <AdminOverview onOpen={openWorkspace} />}
      {tab === "workspaces" && <AdminWorkspaces key={open ?? "list"} initialOpenId={open} />}
      {tab === "plans" && <AdminPlans />}
      {tab === "payments" && <AdminPayments onOpen={openWorkspace} />}
      {tab === "users" && <AdminUsers />}
    </Page>
  );
}
