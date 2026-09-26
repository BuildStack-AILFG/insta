import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import type { PublicBioPage } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string): Promise<PublicBioPage | null> {
  try {
    const res = await fetch(`${API_URL}/public/bio/${encodeURIComponent(slug)}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as PublicBioPage) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  return page ? { title: `${page.title} (@${page.username})`, description: page.bio || `Links from @${page.username}`, robots: { index: true } } : { title: "Page not found" };
}

/** Public link-in-bio page. Link clicks go through the API so they're counted, then redirect. */
export default async function BioPage({ params }: Props) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  return (
    <main className="theme-fixed flex min-h-screen justify-center bg-gradient-to-b from-[#2a0a1c] via-black to-[#1a0610] px-4 py-12 text-white">
      <div className="w-full max-w-md text-center">
        {page.profile_picture_url
          ? <img src={page.profile_picture_url} alt="" className="mx-auto h-24 w-24 rounded-full object-cover ring-4 ring-pink-500/70" />
          : <div className="mx-auto h-24 w-24 rounded-full bg-gradient-to-br from-pink-500 to-orange-400" />}
        <h1 className="mt-4 text-[22px] font-bold">{page.title}</h1>
        <a href={`https://instagram.com/${page.username}`} target="_blank" rel="noreferrer" className="text-[14px] text-pink-300 hover:underline">@{page.username}</a>
        {page.bio && <p className="mx-auto mt-3 max-w-sm whitespace-pre-wrap text-[14.5px] text-white/75">{page.bio}</p>}
        <div className="mt-8 space-y-3">
          {page.dm_button && (
            <a href={page.dm_button.url} className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-600 px-5 py-4 text-[15px] font-semibold shadow-[0_10px_30px_rgba(236,72,153,0.35)] transition hover:brightness-110">
              <MessageCircle size={18} /> {page.dm_button.text}
            </a>
          )}
          {page.links.map((l) => (
            <a key={l.index} href={`${API_URL}/public/bio/${encodeURIComponent(page.slug)}/go/${l.index}`} rel="noreferrer"
              className="block rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-[15px] font-medium backdrop-blur transition hover:border-pink-400/60 hover:bg-white/[0.1]">
              {l.title}
            </a>
          ))}
        </div>
        <Link href="/" className="mt-12 inline-block text-[11.5px] text-white/35 hover:text-white/60">Made with GramForGrow</Link>
      </div>
    </main>
  );
}
