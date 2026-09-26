import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { SITE } from "@/lib/site/config";

/** Share image for any page: /og?title=…&kind=… . Text is clamped so a crafted URL can't produce an unreadable or oversized card. */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const title = (q.get("title") || `${SITE.name} — ${SITE.tagline}`).slice(0, 110);
  const kind = (q.get("kind") || "").slice(0, 24);
  const size = title.length > 70 ? 54 : title.length > 45 ? 64 : 74;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #001a12 0%, #000000 55%, #00382a 100%)", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "#ec4899", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800 }}>L</div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>{SITE.name}</div>
          {kind && <div style={{ marginLeft: 12, padding: "6px 16px", borderRadius: 999, border: "2px solid rgba(255,255,255,0.25)", fontSize: 22, color: "#7fe3c3" }}>{kind}</div>}
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
