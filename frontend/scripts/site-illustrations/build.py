"""GramForGrow industry illustrations (pink theme) — original artwork, no third-party images.

Each card shows the product's core moment: people comment on a post, GramForGrow replies in their DMs automatically.
Run from frontend/: `python scripts/site-illustrations/build.py` -> public/images/site/industries/*.svg
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from draw import FRONTEND, INK, MUTED, Svg, text_w  # noqa: E402

PINK = "#EC4899"
PINK_DARK = "#BE185D"
ROSE = "#F9A8D4"
THEME = {
    "bg1": "#3D0B2B", "bg2": "#0D0309", "glow": "#F472B6", "glow_op": 0.32, "dot": "#FFFFFF", "dot_op": 0.06,
    "header": PINK_DARK, "avatar": "#9D174D", "wallpaper": "#FFF5FA", "wall_dot": PINK,
    "out": "#DB2777", "out_text": "#FFFFFF", "out_time": "#FCE7F3", "in": "#FFFFFF", "link": "#DB2777", "frame": "#140510",
}
W, H = 800, 396
AV = ["#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#F43F5E", "#6366F1"]


def scene(icon, handle, colors, caption, comments, dm, button, stat, glow=(0.15, 0.2)):
    s = Svg(W, H, THEME)
    s.background(glow)
    s.icon_badge(icon, 64, 64, 28, PINK)

    # the post
    x, y, w = 130, 34, 262
    s.card(x, y, w, 330, 16)
    s.circle(x + 26, y + 26, 13, "none", PINK, 2.2)
    s.avatar(x + 26, y + 26, 10, handle[0].upper(), PINK_DARK)
    s.text(x + 46, y + 31, handle, 13.5, INK, 700)
    s.icon("ellipsis", x + w - 32, y + 16, 20, MUTED)
    g = s.uid("post")
    s.defs.append(f'<linearGradient id="{g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{colors[0]}"/><stop offset="1" stop-color="{colors[1]}"/></linearGradient>')
    s.rect(x, y + 50, w, 132, 0, f"url(#{g})")
    s.icon(icon, x + w / 2 - 34, y + 82, 68, "#FFFFFF", 1.6)
    for i, ic in enumerate(("heart", "message-circle", "send")):
        s.icon(ic, x + 14 + i * 32, y + 192, 21, INK, 2)
    s.icon("bookmark", x + w - 34, y + 192, 21, INK, 2)
    s.text(x + 14, y + 236, caption, 13.5, INK, 600)
    for i, (who, txt) in enumerate(comments):
        cy = y + 262 + i * 32
        s.avatar(x + 26, cy + 4, 11, who[0].upper(), AV[sum(map(ord, who)) % len(AV)])
        s.text(x + 44, cy + 9, who, 12.5, INK, 700)
        s.text(x + 44 + text_w(who, 12.5, 700) + 6, cy + 9, txt, 12.5, INK)

    # comment -> DM
    s.path(f"M{x + w + 6} {y + 270} C {x + w + 60} {y + 270}, {x + w + 40} 150, {x + w + 92} 150", stroke=ROSE, sw=2.5, dash="6 7")
    s.chip(x + w + 30, 70, "Auto-DM in 2 sec", "#FFFFFF", PINK_DARK, 13, "zap")

    # the DM thread
    dx = 490
    s.card(dx, 120, 276, 228, 16)
    s.avatar(dx + 26, 146, 12, handle[0].upper(), PINK_DARK)
    s.text(dx + 46, 151, handle, 13, INK, 700)
    s.line(dx, 168, dx + 276, 168, "#F3E1EA", 1.2)
    by = s.bubble(dx + 256, 182, [comments[0][1]], "out", 13.5)
    by = s.bubble(dx + 18, by + 12, dm, "in", 13.5, buttons=[button], fill="#FDF0F6")
    s.chip(dx, 362 - 18, stat, "#FFFFFF", INK, 12.5, "message-circle-heart") if by < 330 else None
    return s


SCENES = {
    "beauty-cosmetics": ("sparkles", "glow.by.riya", ("#F9A8D4", "#C026D3"), "New lipstick shade drop 💄",
                         [("ananya", "shade name?? 😍"), ("kriti", "LINK")], ["Hey Ananya! 💖 It's Rose Nude.", "Here's 10% off for you:"],
                         ("shopping-bag", "Shop the shade"), "Replied to 1,240 comments"),
    "ecommerce": ("footprints", "kicks.depot", ("#FDBA74", "#EC4899"), "Restock is live 🔥",
                  [("rahul", "price?"), ("sid", "size 9 there?")], ["Hi Rahul! These are ₹2,499", "and size 9 is in stock 👟"],
                  ("shopping-cart", "Buy now"), "₹4.2L sales from comments"),
    "creators": ("book-open", "fit.with.aman", ("#C4B5FD", "#EC4899"), "Comment GUIDE for my free plan",
                 [("neha", "GUIDE"), ("arjun", "GUIDE 🙌")], ["Here's your free 30-day", "workout plan, Neha! 📘"],
                 ("download", "Get the guide"), "3,800 guides delivered"),
    "education": ("graduation-cap", "maths.by.ankit", ("#A5B4FC", "#DB2777"), "Free JEE webinar this Sunday",
                  [("priya", "interested"), ("dev", "link?")], ["Hi Priya! 🎓 Sunday, 11 AM.", "Save your free seat here:"],
                  ("calendar-check", "Register free"), "620 webinar sign-ups"),
    "spas-salons": ("scissors", "glow.salon", ("#FBCFE8", "#F472B6"), "Bridal glow package ✨",
                    [("meera", "free tomorrow?"), ("isha", "price?")], ["Hi Meera! Tomorrow 4 PM is", "open. Book in 2 taps:"],
                    ("calendar-check", "Book a slot"), "180 bookings this month"),
    "restaurant-food": ("coffee", "the.brew.cafe", ("#FCD34D", "#F472B6"), "New brunch menu 🥞",
                        [("kabir", "menu pls"), ("zoya", "table for 4?")], ["Hi Kabir! ☕ Here's our menu", "and table booking link:"],
                        ("utensils", "View menu"), "92 tables booked from DMs"),
    "health-wellness": ("heart-pulse", "yoga.with.tara", ("#6EE7B7", "#EC4899"), "21-day transformation 🧘",
                        [("rohit", "details?"), ("anu", "fees?")], ["Hi Rohit! 21 days for ₹1,999.", "Share your number to join:"],
                        ("phone", "Share number"), "410 leads captured"),
    "travel-tourism": ("plane", "wander.india", ("#7DD3FC", "#EC4899"), "Bali under ₹60k ✈️",
                       [("sana", "itinerary?"), ("vikram", "price for 2?")], ["Hi Sana! 🌴 5N/6D itinerary", "and prices for 2 here:"],
                       ("map", "See itinerary"), "24×7 replies, zero missed"),
    "real-estate": ("building-2", "skyline.homes", ("#93C5FD", "#BE185D"), "3BHK walkthrough 🏡",
                    [("amit", "price?"), ("pooja", "brochure pls")], ["Hi Amit! Starts at ₹1.2 Cr.", "Brochure + site visit:"],
                    ("file-down", "Get brochure"), "75 site visits booked"),
    "home-decor": ("sofa", "nest.decor", ("#FDE68A", "#DB2777"), "Living room makeover",
                   [("tara", "where's this lamp from?"), ("raj", "link?")], ["Hi Tara! 💡 It's our Arc lamp,", "₹3,299. Shop it here:"],
                   ("shopping-bag", "Shop the look"), "Every “link?” answered"),
    "marketing-agencies": ("briefcase", "growthlab.agency", ("#C4B5FD", "#BE185D"), "Client got 3x leads in 30 days",
                           [("nikhil", "how?"), ("simran", "case study?")], ["Hi Nikhil! 📈 Full case study", "and a free audit for you:"],
                           ("file-text", "Read case study"), "12 client accounts, 1 login"),
    "freelancer-consultants": ("pen-tool", "design.by.kiran", ("#F9A8D4", "#7C3AED"), "Brand identity project ✨",
                               [("aditya", "info"), ("megha", "rates?")], ["Hi Aditya! Here's my portfolio", "and a link to book a call:"],
                               ("calendar", "Book a call"), "38 discovery calls booked"),
}

out = FRONTEND / "public" / "images" / "site" / "industries"
out.mkdir(parents=True, exist_ok=True)
for name, args in SCENES.items():
    (out / f"{name}.svg").write_text(scene(*args).render(), encoding="utf-8")
    print(f"industries/{name}.svg")
