"use client";

import { ClipboardList } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/kit";
import AssignmentRules from "@/components/dashboard/AssignmentRules";

export default function AssignmentRulesPage() {
  return (
    <Page>
      <PageHeader icon={<ClipboardList size={20} />} title="Assignment rules" subtitle="Decide how new conversations are shared across your team. You can always reassign a chat from the inbox." />
      <AssignmentRules />
    </Page>
  );
}
