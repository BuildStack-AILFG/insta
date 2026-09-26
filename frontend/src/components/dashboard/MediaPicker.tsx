"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Image as ImageIcon, MessageCircle } from "lucide-react";
import { Alert, Button, cx, Modal, Spinner } from "@/components/ui/kit";
import { errorMessage, instagram, type IgAccount, type IgMedia, type MediaPreview } from "@/lib/api";

/** Pick posts / reels from a connected account's grid (used by comment automations and giveaways). */
export default function MediaPicker({ account, selected, onClose, onDone, single = false }: { account: IgAccount; selected: MediaPreview[]; onClose: () => void; onDone: (sel: MediaPreview[]) => void; single?: boolean }) {
  const [items, setItems] = useState<IgMedia[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<MediaPreview[]>(selected);
  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    try { const r = await instagram.media(account.id, cursor); setItems((x) => (cursor ? [...x, ...r.items] : r.items)); setAfter(r.after); } catch (e) { setErr(errorMessage(e)); } finally { setLoading(false); }
  }, [account.id]);
  useEffect(() => { void load(); }, [load]);
  const toggle = (m: IgMedia) => setSel((s) => {
    const item = { id: m.id, caption: m.caption?.slice(0, 200) ?? null, thumbnail_url: m.thumbnail_url, permalink: m.permalink };
    if (s.some((x) => x.id === m.id)) return s.filter((x) => x.id !== m.id);
    return single ? [item] : [...s, item];
  });
  return (
    <Modal open onClose={onClose} title={`Choose posts from @${account.username}`} width={760}
      footer={<><span className="mr-auto text-[12.5px] text-white/50">{sel.length} selected</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => onDone(sel)} disabled={sel.length === 0}>{single ? "Use this post" : `Use ${sel.length || ""} post${sel.length === 1 ? "" : "s"}`}</Button></>}>
      {err && <Alert>{err}</Alert>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((m) => {
          const on = sel.some((x) => x.id === m.id);
          return (
            <button key={m.id} onClick={() => toggle(m)} className={cx("group relative aspect-square overflow-hidden rounded-lg bg-white/[0.06] ring-2 transition", on ? "ring-[var(--brand)]" : "ring-transparent hover:ring-white/30")} title={m.caption ?? ""}>
              {m.thumbnail_url ? <img src={m.thumbnail_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/30"><ImageIcon size={20} /></div>}
              {on && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white btn-accent" style={{ background: "var(--brand)" }}><Check size={12} /></span>}
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-[10.5px] text-white/80">
                {m.media_product_type === "REELS" ? "Reel" : m.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Post"} · <MessageCircle size={10} /> {m.comments_count ?? 0}
              </span>
            </button>
          );
        })}
      </div>
      {loading && <Spinner />}
      {!loading && items.length === 0 && !err && <div className="py-10 text-center text-[13px] text-white/45">No posts found on this account yet.</div>}
      {after && !loading && <div className="mt-3 text-center"><Button variant="ghost" size="sm" onClick={() => load(after)}>Load more</Button></div>}
    </Modal>
  );
}
