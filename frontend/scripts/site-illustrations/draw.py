"""SVG drawing kit for the marketing-site illustrations (our own artwork, so no third-party copyright).

Icons come from lucide (ISC licence, already a dependency). Everything else is drawn here: chat bubbles, phones, cards, charts.
"""

from __future__ import annotations

import html
import re
from functools import lru_cache
from pathlib import Path

# the app folder this script lives in: the nearest parent that has lucide installed
FRONTEND = next(p for p in Path(__file__).resolve().parents if (p / "node_modules" / "lucide-react").is_dir())
LUCIDE = FRONTEND / "node_modules" / "lucide-react" / "dist" / "esm" / "icons"

FONT = "'Plus Jakarta Sans','Inter','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

# palette — brand green from src/app/globals.css, cream from the light theme
BRAND = "#00926B"
BRAND_DARK = "#007A59"
BRIGHT = "#00C48F"
MINT = "#D9FDD3"      # outgoing bubble
CREAM = "#F1F3E8"     # chat wallpaper
CARD = "#FFFFFF"
INK = "#1B2E1F"
MUTED = "#5F6F64"
LINE = "#E3E8DC"
AMBER = "#F5B841"
VIOLET = "#8B5CF6"
CORAL = "#F2766B"
SKY = "#4FA3F7"


def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def text_w(s: str, size: float, weight: int = 400) -> float:
    """Rough rendered width — good enough to size bubbles and chips."""
    k = 0.56 if weight < 600 else 0.6
    return sum((0.32 if c in "il.,:;'|!" else 0.9 if c in "MW@%" else 0.3 if c == " " else 1.0) for c in s) * size * k


@lru_cache(maxsize=None)
def lucide(name: str) -> list[tuple[str, dict]]:
    src = (LUCIDE / f"{name}.js").read_text(encoding="utf-8")
    if "__iconNode = [" not in src:  # renamed icon kept as an alias that re-exports the new file
        return lucide(re.search(r"from '\./([\w-]+)\.js'", src).group(1))
    body = src.split("__iconNode = [", 1)[1].split("];", 1)[0]
    out = []
    for tag, attrs in re.findall(r'\[\s*"(\w+)",\s*\{(.*?)\}\s*\]', body, re.S):
        a = {k: v for k, v in re.findall(r'(\w+):\s*"([^"]*)"', attrs) if k != "key"}
        out.append((tag, a))
    if not out:
        raise ValueError(f"no lucide icon {name}")
    return out


# A theme recolours the shared furniture (background, phone, bubbles); scenes pick their own accent colours.
TALKFORGROW = {
    "bg1": "#0B3A2B", "bg2": "#05140F", "glow": BRIGHT, "glow_op": 0.35, "dot": "#FFFFFF", "dot_op": 0.07,
    "shadow_op": 0.28, "header": BRAND_DARK, "avatar": "#0B5F48", "wallpaper": CREAM, "wall_dot": BRAND,
    "out": MINT, "out_text": INK, "out_time": MUTED, "in": CARD, "link": "#1E88C8", "frame": "#0B0F0D",
}


class Svg:
    def __init__(self, w: int, h: int, theme: dict | None = None):
        self.w, self.h = w, h
        self.t = {**TALKFORGROW, **(theme or {})}
        self.defs: list[str] = []
        self.els: list[str] = []
        self._ids = 0

    def uid(self, p: str) -> str:
        self._ids += 1
        return f"{p}{self._ids}"

    def add(self, s: str) -> None:
        self.els.append(s)

    # ---- primitives -------------------------------------------------------------------------------------------------
    def rect(self, x, y, w, h, r=0, fill="none", stroke=None, sw=1, opacity=1, shadow=False, dash=None):
        f = ' filter="url(#sh)"' if shadow else ""
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        d = f' stroke-dasharray="{dash}"' if dash else ""
        op = f' opacity="{opacity}"' if opacity != 1 else ""
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{fill}"{st}{d}{op}{f}/>')

    def circle(self, cx, cy, r, fill="none", stroke=None, sw=1, opacity=1, shadow=False):
        f = ' filter="url(#sh)"' if shadow else ""
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        op = f' opacity="{opacity}"' if opacity != 1 else ""
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{fill}"{st}{op}{f}/>')

    def line(self, x1, y1, x2, y2, stroke=LINE, sw=1, dash=None, opacity=1):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round"{d} opacity="{opacity}"/>')

    def path(self, d, fill="none", stroke=None, sw=1, dash=None, opacity=1):
        st = f' stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"' if stroke else ""
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<path d="{d}" fill="{fill}"{st}{da} opacity="{opacity}"/>')

    def text(self, x, y, s, size=16, fill=INK, weight=400, anchor="start", opacity=1, italic=False):
        it = ' font-style="italic"' if italic else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
                 f'text-anchor="{anchor}" opacity="{opacity}"{it}>{esc(s)}</text>')

    def icon(self, name, x, y, size=24, color=INK, sw=2):
        """Lucide icon with its top-left corner at (x, y)."""
        k = size / 24
        parts = []
        for tag, a in lucide(name):
            attrs = " ".join(f'{k2.replace("_", "-")}="{v}"' for k2, v in a.items())
            parts.append(f"<{tag} {attrs}/>")
        self.add(f'<g transform="translate({x:.1f} {y:.1f}) scale({k:.4f})" fill="none" stroke="{color}" stroke-width="{sw}" '
                 f'stroke-linecap="round" stroke-linejoin="round">{"".join(parts)}</g>')

    def icon_badge(self, name, cx, cy, r=22, bg=BRAND, color="#FFFFFF", shadow=True, sw=2):
        self.circle(cx, cy, r, fill=bg, shadow=shadow)
        s = r * 1.05
        self.icon(name, cx - s / 2, cy - s / 2, s, color, sw)

    # ---- composites -------------------------------------------------------------------------------------------------
    def background(self, glow=(0.75, 0.2)):
        g, p = self.uid("bg"), self.uid("dots")
        gl = self.uid("glow")
        t = self.t
        self.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{t["bg1"]}"/>'
                         f'<stop offset="1" stop-color="{t["bg2"]}"/></linearGradient>')
        self.defs.append(f'<pattern id="{p}" width="22" height="22" patternUnits="userSpaceOnUse">'
                         f'<circle cx="2" cy="2" r="1.2" fill="{t["dot"]}" opacity="{t["dot_op"]}"/></pattern>')
        self.defs.append(f'<radialGradient id="{gl}" cx="{glow[0]}" cy="{glow[1]}" r="0.6"><stop offset="0" stop-color="{t["glow"]}" stop-opacity="{t["glow_op"]}"/>'
                         f'<stop offset="1" stop-color="{t["glow"]}" stop-opacity="0"/></radialGradient>')
        self.add(f'<rect width="{self.w}" height="{self.h}" fill="url(#{g})"/>')
        self.add(f'<rect width="{self.w}" height="{self.h}" fill="url(#{p})"/>')
        self.add(f'<rect width="{self.w}" height="{self.h}" fill="url(#{gl})"/>')

    def bubble(self, x, y, lines, side="in", size=16, w=None, buttons=(), time=None, bold_first=False, pad=12, fill=None):
        """WhatsApp-style bubble. `x` is the left edge for 'in', the right edge for 'out'. Returns the bottom y."""
        lh = size * 1.38
        tw = max([text_w(l, size, 700 if bold_first and i == 0 else 400) for i, l in enumerate(lines)] + [0])
        bw = w or tw + pad * 2 + (34 if time else 0)
        bh = pad * 2 + lh * len(lines) - (lh - size) + (8 if time else 0)
        btn_h = size * 2.3
        total = bh + btn_h * len(buttons)
        bx = x if side == "in" else x - bw
        fill = fill or (self.t["in"] if side == "in" else self.t["out"])
        ink = self.t["out_text"] if side == "out" else INK
        self.rect(bx, y, bw, total, 12, fill, shadow=True)
        # tail
        if side == "in":
            self.path(f"M{bx + 4} {y} L{bx - 7} {y} L{bx + 10} {y + 12} Z", fill=fill)
        else:
            self.path(f"M{bx + bw - 4} {y} L{bx + bw + 7} {y} L{bx + bw - 10} {y + 12} Z", fill=fill)
        for i, l in enumerate(lines):
            self.text(bx + pad, y + pad + size * 0.9 + i * lh, l, size, ink, 700 if bold_first and i == 0 else 400)
        if time:
            self.text(bx + bw - pad, y + bh - pad + 4, time, size * 0.68, self.t["out_time"] if side == "out" else MUTED, anchor="end")
            if side == "out":
                self.icon("check-check", bx + bw - pad - text_w(time, size * 0.68) - size, y + bh - pad - size * 0.55, size * 0.8, SKY, 2.4)
        cy = y + bh
        for b in buttons:
            self.line(bx, cy, bx + bw, cy, LINE, 1.2)
            label = b if isinstance(b, str) else b[1]
            ic = None if isinstance(b, str) else b[0]
            tw2 = text_w(label, size * 0.95, 600) + (size * 1.2 if ic else 0)
            sx = bx + (bw - tw2) / 2
            if ic:
                self.icon(ic, sx, cy + btn_h / 2 - size * 0.5, size, self.t["link"], 2)
                sx += size * 1.2
            self.text(sx, cy + btn_h / 2 + size * 0.33, label, size * 0.95, self.t["link"], 600)
            cy += btn_h
        return y + total

    def chip(self, x, y, label, bg=BRAND, color="#FFFFFF", size=14, icon=None, pad=10, h=None, weight=700, stroke=None):
        h = h or size * 2
        w = text_w(label, size, weight) + pad * 2 + (size * 1.25 if icon else 0)
        self.rect(x, y, w, h, h / 2, bg, stroke=stroke, sw=1.5 if stroke else 1)
        tx = x + pad
        if icon:
            self.icon(icon, tx, y + (h - size) / 2, size, color, 2.2)
            tx += size * 1.25
        self.text(tx, y + h / 2 + size * 0.35, label, size, color, weight)
        return w

    def avatar(self, cx, cy, r, initials, bg):
        self.circle(cx, cy, r, bg)
        self.text(cx, cy + r * 0.36, initials, r * 0.95, "#FFFFFF", 700, "middle")

    def phone(self, x, y, w, h, title, subtitle="online", avatar=("TF", BRAND)):
        """Phone frame with a chat header. Returns the y where messages can start."""
        self.rect(x - 8, y - 8, w + 16, h + 16, 34, self.t["frame"], shadow=True)
        clip = self.uid("ph")
        self.defs.append(f'<clipPath id="{clip}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="26"/></clipPath>')
        self.add(f'<g clip-path="url(#{clip})">')
        self.rect(x, y, w, h, 0, self.t["wallpaper"])
        p = self.uid("wp")
        self.defs.append(f'<pattern id="{p}" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.4" fill="{self.t["wall_dot"]}" opacity="0.08"/></pattern>')
        self.rect(x, y, w, h, 0, f"url(#{p})")
        hh = 64
        self.rect(x, y, w, hh, 0, self.t["header"])
        self.icon("chevron-left", x + 8, y + 20, 22, "#FFFFFF", 2.4)
        self.avatar(x + 50, y + 32, 17, avatar[0], avatar[1] if avatar[1] != BRAND else self.t["avatar"])
        self.text(x + 76, y + 29, title, 15, "#FFFFFF", 700)
        self.text(x + 76, y + 47, subtitle, 11.5, "#FFFFFF", 400, opacity=0.8)
        self.icon("phone", x + w - 34, y + 22, 18, "#FFFFFF", 2)
        return y + hh + 16

    def end_phone(self):
        self.add("</g>")

    def window(self, x, y, w, h, title=""):
        self.rect(x, y, w, h, 14, CARD, shadow=True)
        self.rect(x, y, w, 36, 0, "#F4F6F0")
        self.rect(x, y, w, 36, 14, "#F4F6F0")
        self.rect(x, y + 20, w, 16, 0, "#F4F6F0")
        for i, c in enumerate(("#F2766B", "#F5B841", "#3CC37A")):
            self.circle(x + 18 + i * 16, y + 18, 5, c)
        if title:
            self.text(x + w / 2, y + 23, title, 12.5, MUTED, 600, "middle")
        self.line(x, y + 36, x + w, y + 36, LINE, 1)
        return y + 36

    def card(self, x, y, w, h, r=14, fill=CARD):
        self.rect(x, y, w, h, r, fill, shadow=True)

    def skeleton(self, x, y, widths, h=8, gap=14, color="#E6EBE0"):
        for i, w in enumerate(widths):
            self.rect(x, y + i * gap, w, h, h / 2, color)

    def render(self) -> str:
        sh = ('<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="9" '
              f'flood-color="#000000" flood-opacity="{self.t["shadow_op"]}"/></filter>')
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}">'
                f'<defs>{sh}{"".join(self.defs)}</defs>{"".join(self.els)}</svg>')
