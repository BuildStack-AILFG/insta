"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button, useUi } from "@/components/ui/kit";
import { errorMessage, uploadShopPhoto } from "@/lib/api";

/** "Upload photo" button: picks image file(s) from the device, uploads them to Cloudinary and hands back their links. */
export default function PhotoUpload({ onUploaded, multiple = false, max = 8, label, size = "sm" }: {
  onUploaded: (urls: string[]) => void; multiple?: boolean; max?: number; label?: string; size?: "sm" | "md";
}) {
  const { toast } = useUi();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, multiple ? max : 1);
    if (input.current) input.current.value = "";
    if (!list.length) return;
    const urls: string[] = [];
    try {
      for (const [i, f] of list.entries()) {
        setBusy(list.length > 1 ? `Uploading ${i + 1}/${list.length}…` : "Uploading…");
        urls.push(await uploadShopPhoto(f));
      }
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : errorMessage(e), "error");
    } finally {
      setBusy(null);
      if (urls.length) onUploaded(urls);
    }
  };

  return (
    <>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple={multiple} className="hidden"
        onChange={(e) => void pick(e.target.files)} />
      <Button type="button" size={size} variant="ghost" loading={!!busy} onClick={() => input.current?.click()}>
        <Upload size={13} /> {busy ?? label ?? (multiple ? "Upload photos" : "Upload photo")}
      </Button>
    </>
  );
}
