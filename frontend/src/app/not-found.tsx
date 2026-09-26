import NotFoundView from "@/components/site/NotFoundView";
import SiteShell from "@/components/site/SiteShell";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function RootNotFound() {
  return (
    <SiteShell>
      <NotFoundView />
    </SiteShell>
  );
}
