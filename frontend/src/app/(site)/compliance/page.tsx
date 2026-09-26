import LegalPage, { legalMetadata } from "@/components/site/LegalPage";

export const metadata = legalMetadata("compliance");

export default function Page() {
  return <LegalPage slug="compliance" />;
}
