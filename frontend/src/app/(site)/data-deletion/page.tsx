import Link from "next/link";
import { PageHero, Section } from "@/components/site/blocks";
import { SITE } from "@/lib/site/config";
import { pageMetadata } from "@/lib/site/seo";

export const metadata = pageMetadata({
  title: "Data Deletion",
  description: "How to delete your Instagram data, your DMForGrow account or data a business collected about you, what we delete, how long it takes and how to check the status of a request.",
  path: "/data-deletion",
  ogTitle: "DMForGrow data deletion",
  ogKind: "Legal",
});

const MAIL = SITE.supportEmail;
const mailto = (subject: string) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}`;

const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[14.5px] leading-relaxed text-white/60";
const h2 = "mb-3 text-[17px] font-semibold text-white";
const link = "text-brand hover:underline";

const RETENTION: [string, string][] = [
  ["Instagram data after you remove DMForGrow from Instagram and request deletion", "Deleted automatically and immediately: the connected account, its access token, conversations, comments, contacts' message threads, automations and scheduled posts"],
  ["Instagram account you disconnect in the dashboard", "Access token deleted immediately and no new data collected. Existing workspace data stays until you delete it or ask us to"],
  ["Whole account or workspace deleted on request", "Deleted or anonymised within 90 days of confirming your request, and removed from backups within a further 30 days"],
  ["Invoices, GST and accounting records", "Kept for 8 years because Indian tax and company law requires it, then deleted"],
  ["Security and access logs", "Kept for up to 1 year as required by law, then deleted"],
];

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <>
      <PageHero
        breadcrumbs={[{ name: "Data deletion", path: "/data-deletion" }]}
        overline="Privacy"
        title="Data deletion"
        lead="You can delete the data DMForGrow holds about you at any time. Here's how to do it, what we delete and how long it takes."
        actions={
          <>
            <a href={mailto("Delete my data")} className="rounded-xl bg-brand px-5 py-3 text-[14px] font-semibold text-white hover:bg-brand-hover">Email a deletion request</a>
            <Link href="/privacy" className="rounded-xl border border-white/15 px-5 py-3 text-[14px] font-semibold text-white/80 hover:bg-white/5">Read the privacy policy</Link>
          </>
        }
      />
      <Section narrow>
        <div className="space-y-6">
          {code && (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6 text-[14.5px] leading-relaxed text-white/70">
              <h2 className="mb-2 text-[16px] font-semibold text-white">Request completed</h2>
              <p>
                Confirmation code <code className="rounded bg-white/10 px-1.5 py-0.5 text-white">{code}</code>. The connected Instagram account, its access token,
                conversations, automations and scheduled posts have been deleted from our systems. Keep this code: quote it if you contact us about this request.
              </p>
            </div>
          )}

          <div className={card}>
            <h2 className={h2}>1. Remove DMForGrow from Instagram (deletes your Instagram data automatically)</h2>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>In the Instagram app, open <strong className="text-white/80">Settings and activity → Website permissions → Apps and websites</strong>.</li>
              <li>Under <strong className="text-white/80">Active</strong>, choose DMForGrow and tap <strong className="text-white/80">Remove</strong>.</li>
              <li>Confirm that you also want your data deleted.</li>
            </ol>
            <p className="mt-3">Instagram tells us immediately and we delete everything we hold for that Instagram account. You'll get a confirmation code and a link back to this page so you can check the status.</p>
          </div>

          <div className={card}>
            <h2 className={h2}>2. Disconnect Instagram from your dashboard</h2>
            <p>
              In the DMForGrow dashboard, open the <strong className="text-white/80">Instagram</strong> page and click <strong className="text-white/80">Disconnect</strong>. We stop collecting
              data straight away and delete the stored access token. Your conversations, contacts and automations stay in your workspace until you delete them or ask us to
              (option 3), so you can export them first.
            </p>
          </div>

          <div className={card}>
            <h2 className={h2}>3. Delete your whole DMForGrow account and workspace</h2>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                Email <a href={mailto("Delete my data")} className={link}>{MAIL}</a> from the email address on your account with the subject <strong className="text-white/80">"Delete my data"</strong>.
                Tell us the workspace name and whether you want the whole account or only one workspace deleted.
              </li>
              <li>We may ask you to confirm the request so that nobody else can delete your account.</li>
              <li>We delete your data within the times shown below and email you when it's done.</li>
            </ol>
            <p className="mt-3">Owners can export contacts and deals from the dashboard before asking. Deletion is permanent and cannot be undone.</p>
          </div>

          <div className={card}>
            <h2 className={h2}>4. You messaged or commented on a business that uses DMForGrow</h2>
            <p>
              That business controls your data, so please ask them first. You can also email <a href={mailto("Delete my data - customer of a business")} className={link}>{MAIL}</a> with
              your Instagram username and the name of the business. We'll pass your request to them and help them complete it.
            </p>
          </div>

          <div className={card}>
            <h2 className={h2}>What we delete and when</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-white/10 text-white/80">
                    <th className="py-2 pr-4 font-semibold">Data</th>
                    <th className="py-2 font-semibold">What happens</th>
                  </tr>
                </thead>
                <tbody>
                  {RETENTION.map(([what, when]) => (
                    <tr key={what} className="border-b border-white/5 align-top">
                      <td className="py-2.5 pr-4 text-white/70">{what}</td>
                      <td className="py-2.5">{when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3">We only keep data after deletion where the law requires it, and we don't use kept data for anything else.</p>
          </div>

          <div className={card}>
            <h2 className={h2}>Check the status of a request or raise a concern</h2>
            <p>
              Email <a href={mailto("Data deletion status")} className={link}>{MAIL}</a> with your confirmation code or the email you used to make the request. We reply within
              2 business days. If you aren't satisfied, you can write to our Grievance Officer at the same address with the subject "Grievance Officer". See our{" "}
              <Link href="/privacy" className={link}>Privacy Policy</Link> and <Link href="/terms" className={link}>Terms of Service</Link> for more.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
