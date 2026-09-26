"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Film, ImagePlus, Trash2, UploadCloud } from "lucide-react";
import { Alert, Button, cx, EmptyState, Modal, Spinner, useUi } from "@/components/ui/kit";
import { errorMessage, mediaLibrary, type MediaAsset, type MediaLibraryPage } from "@/lib/api";

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.mov";
const fmtBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

type Kind = "image" | "video";

/** Upload, browse and delete media-library files. With `onToggle`, files can be picked (e.g. for a post). */
export function MediaLibraryPanel({ kind, selected = [], onToggle, max }: {
  kind?: Kind; selected?: string[]; onToggle?: (a: MediaAsset) => void; max?: number;
}) {
  const { toast, confirm } = useUi();
  const [page, setPage] = useState<MediaLibraryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setPage(await mediaLibrary.list({ kind, limit: 200 })); } catch (e) { setError(errorMessage(e, "Couldn't load your media.")); }
  }, [kind]);
  useEffect(() => { void load(); }, [load]);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError(null); setUploading(files.length);
    try {
      const added: MediaAsset[] = [];
      for (let i = 0; i < files.length; i += 10) added.push(...(await mediaLibrary.upload(files.slice(i, i + 10))));
      toast(added.length === 1 ? "File uploaded" : `${added.length} files uploaded`);
      await load();
      if (onToggle) added.filter((a) => !kind || a.kind === kind).slice(0, Math.max(0, (max ?? Infinity) - selected.length)).forEach(onToggle);
    } catch (e) { setError(errorMessage(e, "Upload failed.")); } finally { setUploading(0); }
  };

  const remove = async (a: MediaAsset) => {
    if (!(await confirm({ title: `Delete ${a.name}?`, body: "Posts already published stay on Instagram.", confirmLabel: "Delete", danger: true }))) return;
    try { await mediaLibrary.remove(a.id); await load(); } catch (e) { toast(errorMessage(e), "error"); }
  };

  const full = !!max && selected.length >= max;
  return (
    <div>
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      {page && !page.publicly_reachable && (
        <Alert tone="yellow">Uploads work, but Instagram can only download them once the API has a public https address (set <code>PUBLIC_BASE_URL</code>; an ngrok URL works in development). Until then, scheduled posts using uploads will wait and then fail with this reason.</Alert>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(Array.from(e.dataTransfer.files)); }}
        className={cx("flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center transition",
          dragging ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]" : "border-white/15 bg-white/[0.02]")}>
        {uploading ? <Spinner label={`Uploading ${uploading} file${uploading > 1 ? "s" : ""}…`} /> : (
          <>
            <UploadCloud size={22} className="text-brand-bright" />
            <div className="text-[13px] text-white/80">Drop images or videos here, or <button type="button" className="font-semibold text-brand-bright hover:underline" onClick={() => input.current?.click()}>browse</button></div>
            <div className="text-[11.5px] text-white/40">JPEG, PNG, WebP (converted to JPEG, up to 30 MB) · MP4 / MOV up to 300 MB</div>
          </>
        )}
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>

      {page && (
        <div className="mt-2 flex items-center justify-between text-[11.5px] text-white/45">
          <span>{page.total} file{page.total === 1 ? "" : "s"}{kind ? ` (${kind}s)` : ""}</span>
          <span>{fmtBytes(page.used_bytes)} of {fmtBytes(page.quota_bytes)} used</span>
        </div>
      )}
      {!page ? <Spinner /> : page.items.length === 0 ? (
        <div className="mt-3"><EmptyState icon={<ImagePlus size={22} />} title="No files yet" body="Upload once, then reuse them across posts." /></div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {page.items.map((a) => {
            const on = selected.includes(a.id);
            return (
              <div key={a.id} className={cx("group relative aspect-square overflow-hidden rounded-lg bg-white/[0.06] ring-2 transition", on ? "ring-[var(--brand)]" : "ring-transparent")}>
                <button type="button" disabled={!onToggle || (!on && full)} onClick={() => onToggle?.(a)} title={a.name}
                  className={cx("h-full w-full", onToggle && !on && full && "cursor-not-allowed opacity-50")}>
                  {a.kind === "video" ? <video src={a.url} muted preload="metadata" className="h-full w-full object-cover" /> : <img src={a.url} alt={a.name} loading="lazy" className="h-full w-full object-cover" />}
                </button>
                {a.kind === "video" && <Film size={13} className="pointer-events-none absolute bottom-1.5 left-1.5 text-white drop-shadow" />}
                {a.width && a.height && <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/65 px-1 text-[9.5px] text-white">{a.width}×{a.height}</span>}
                {on && <span className="pointer-events-none absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--brand)] text-white"><Check size={12} /></span>}
                <button type="button" onClick={() => remove(a)} aria-label={`Delete ${a.name}`}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100"><Trash2 size={11} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Modal picker: choose up to `max` files (optionally only images or only videos). */
export function MediaLibraryPicker({ kind, max, onClose, onDone }: { kind?: Kind; max: number; onClose: () => void; onDone: (picked: MediaAsset[]) => void }) {
  const [picked, setPicked] = useState<MediaAsset[]>([]);
  const toggle = (a: MediaAsset) => setPicked((p) => (p.some((x) => x.id === a.id) ? p.filter((x) => x.id !== a.id) : p.length < max ? [...p, a] : p));
  return (
    <Modal open onClose={onClose} title={kind === "video" ? "Choose a video" : kind === "image" ? "Choose images" : "Choose from your media library"} width={760}
      footer={<><span className="mr-auto text-[12px] text-white/45">{picked.length} of {max} selected</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!picked.length} onClick={() => onDone(picked)}>Add {picked.length || ""}</Button></>}>
      <MediaLibraryPanel kind={kind} max={max} selected={picked.map((p) => p.id)} onToggle={toggle} />
    </Modal>
  );
}
