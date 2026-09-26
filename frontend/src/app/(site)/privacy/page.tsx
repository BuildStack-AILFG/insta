import LegalPage, { legalMetadata } from "@/components/site/LegalPage";

export const metadata = legalMetadata("privacy");

export default function Page() {
  return <LegalPage slug="privacy" />;
}
