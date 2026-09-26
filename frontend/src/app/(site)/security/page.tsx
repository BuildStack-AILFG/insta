import LegalPage, { legalMetadata } from "@/components/site/LegalPage";

export const metadata = legalMetadata("security");

export default function Page() {
  return <LegalPage slug="security" />;
}
