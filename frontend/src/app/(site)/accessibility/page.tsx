import LegalPage, { legalMetadata } from "@/components/site/LegalPage";

export const metadata = legalMetadata("accessibility");

export default function Page() {
  return <LegalPage slug="accessibility" />;
}
