"""
CelerApps brand asset builder.

Reads `source-logo.png` (full lockup with white background) and produces every
LinkedIn / social / web asset listed in LINKEDIN_SETUP.md.

Usage:
    python3 -m venv /tmp/celervenv
    /tmp/celervenv/bin/pip install Pillow
    /tmp/celervenv/bin/python build_assets.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).parent
SRC = HERE / "source-logo.png"

# Brand palette
NAVY = (5, 8, 16)
NAVY_MID = (15, 23, 42)
PURPLE = (124, 58, 237)
CYAN = (6, 182, 212)
WHITE = (255, 255, 255)
TEXT_DIM = (203, 213, 225)


# ── 1. Strip white background, split into full lockup + icon-only ──────────

def strip_white_bg(img: Image.Image, threshold: int = 220) -> Image.Image:
    """Make near-white pixels transparent."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if min(r, g, b) >= threshold:
                px[x, y] = (r, g, b, 0)
    return img


def trim(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def build_masters() -> tuple[Image.Image, Image.Image]:
    """Returns (full_lockup, icon_only) — both transparent, trimmed."""
    raw = Image.open(SRC)
    transparent = strip_white_bg(raw, threshold=220)
    full = trim(transparent)
    full.save(HERE / "logo-master-transparent.png")

    # Icon-only: crop the left ~57% of the lockup (heuristic from this logo)
    w, h = full.size
    icon = trim(full.crop((0, 0, int(w * 0.57), h)))
    icon.save(HERE / "logo-mark-transparent.png")
    return full, icon


# ── 2. Helpers ─────────────────────────────────────────────────────────────

def gradient_bg(size: tuple[int, int], top=NAVY, bottom=NAVY_MID) -> Image.Image:
    w, h = size
    bg = Image.new("RGB", size, top)
    px = bg.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return bg.convert("RGBA")


def fit_centered(canvas: Image.Image, art: Image.Image, scale: float = 0.7) -> Image.Image:
    cw, ch = canvas.size
    aw, ah = art.size
    target = min(cw, ch) * scale
    ratio = target / max(aw, ah)
    new = art.resize((int(aw * ratio), int(ah * ratio)), Image.LANCZOS)
    nw, nh = new.size
    canvas.paste(new, ((cw - nw) // 2, (ch - nh) // 2), new)
    return canvas


# ── 3. Asset renderers ─────────────────────────────────────────────────────

def render_linkedin_logo(icon: Image.Image):
    canvas = gradient_bg((400, 400))
    fit_centered(canvas, icon, scale=0.65)
    canvas.convert("RGB").save(HERE / "linkedin-logo-400.png", optimize=True)


def render_linkedin_logo_transparent(icon: Image.Image):
    canvas = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    fit_centered(canvas, icon, scale=0.85)
    canvas.save(HERE / "linkedin-logo-transparent-400.png", optimize=True)


def render_linkedin_banner(icon: Image.Image):
    W, H = 1128, 191
    canvas = gradient_bg((W, H))
    draw = ImageDraw.Draw(canvas)

    # Right-side icon
    icon_h = int(H * 0.7)
    ratio = icon_h / icon.height
    iw = int(icon.width * ratio)
    icon_r = icon.resize((iw, icon_h), Image.LANCZOS)
    canvas.paste(icon_r, (W - iw - 40, (H - icon_h) // 2), icon_r)

    # Left-side text
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
        sub_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
    except OSError:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()

    draw.text((48, 50), "AI-powered SaaS for Indian businesses", fill=WHITE, font=title_font)
    draw.text((48, 100), "DialKaro  ·  BillKaro  ·  celerapps.com", fill=TEXT_DIM, font=sub_font)

    # Accent chips
    for i, (label, color) in enumerate([("DialKaro", PURPLE), ("BillKaro", CYAN)]):
        x = 48 + i * 130
        draw.rounded_rectangle((x, 135, x + 110, 165), radius=14, fill=color)
        bbox = draw.textbbox((0, 0), label, font=sub_font)
        tw = bbox[2] - bbox[0]
        draw.text((x + (110 - tw) / 2, 142), label, fill=WHITE, font=sub_font)

    canvas.convert("RGB").save(HERE / "linkedin-banner-1128x191.png", optimize=True)


def render_social_square(full: Image.Image):
    canvas = gradient_bg((1080, 1080))
    fit_centered(canvas, full, scale=0.75)
    canvas.convert("RGB").save(HERE / "social-square-1080.png", optimize=True)


def render_email_signature(full: Image.Image):
    canvas = Image.new("RGBA", (200, 60), (0, 0, 0, 0))
    fit_centered(canvas, full, scale=0.95)
    canvas.save(HERE / "email-signature-200x60.png", optimize=True)


def render_favicon(icon: Image.Image):
    canvas = gradient_bg((32, 32))
    fit_centered(canvas, icon, scale=0.85)
    canvas.convert("RGB").save(HERE / "favicon-32.png", optimize=True)


def render_apple_touch(icon: Image.Image):
    canvas = gradient_bg((180, 180))
    fit_centered(canvas, icon, scale=0.7)
    canvas.convert("RGB").save(HERE / "apple-touch-180.png", optimize=True)


# ── 4. Run all ─────────────────────────────────────────────────────────────

def main():
    if not SRC.exists():
        raise SystemExit(f"Missing {SRC}")
    full, icon = build_masters()
    render_linkedin_logo(icon)
    render_linkedin_logo_transparent(icon)
    render_linkedin_banner(icon)
    render_social_square(full)
    render_email_signature(full)
    render_favicon(icon)
    render_apple_touch(icon)
    print("Done. Wrote 7 assets + 2 masters to", HERE)


if __name__ == "__main__":
    main()
