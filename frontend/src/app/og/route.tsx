import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE } from "@/lib/site/config";

let logoData: Promise<string> | undefined;
const logoMark = () => (logoData ??= readFile(join(process.cwd(), "public/logo-mark.png")).then((b) => `data:image/png;base64,${b.toString("base64")}`));

/** Share image for any page: /og?title=…&kind=… . Text is clamped so a crafted URL can't produce an unreadable or oversized card. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const title = (q.get("title") || `${SITE.name} — ${SITE.tagline}`).slice(0, 110);
  const kind = (q.get("kind") || "").slice(0, 24);
  const size = title.length > 70 ? 54 : title.length > 45 ? 64 : 74;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #2a0616 0%, #000000 55%, #3d0a22 100%)", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={await logoMark()} width={60} height={60} alt="" />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -1 }}><span>GramFor</span><span style={{ color: "#e91e78", marginLeft: -8 }}>Grow</span></div>
          {kind && <div style={{ marginLeft: 12, padding: "6px 16px", borderRadius: 999, border: "2px solid rgba(255,255,255,0.25)", fontSize: 22, color: "#ff8fbf" }}>{kind}</div>}
        </div>
        <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.1, letterSpacing: -2, maxWidth: 1000 }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: "rgba(255,255,255,0.6)" }}>
          <div>Instagram comment &amp; DM automation</div>
          <div>{SITE.url.replace(/^https?:\/\//, "")}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400" } },
  );
}
