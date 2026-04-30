"""
Build the YouTube/Loom thumbnail for the DialKaro 60-sec demo.

Output: branding/dialkaro/loom-thumbnail-1280x720.png

Usage:
    /tmp/celervenv/bin/python build_thumbnail.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
ICON = HERE.parent / "celerapps" / "logo-mark-transparent.png"  # CelerApps icon (reuse)
OUT = HERE / "loom-thumbnail-1280x720.png"

# Brand palette (same as CelerApps)
NAVY = (5, 8, 16)
NAVY_MID = (15, 23, 42)
PURPLE = (124, 58, 237)
CYAN = (6, 182, 212)
ORANGE = (251, 146, 60)
WHITE = (255, 255, 255)
DIM = (203, 213, 225)


def gradient_bg(size, top, bottom):
    w, h = size
    img = Image.new("RGB", size, top)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img.convert("RGBA")


def font(size: int):
    candidates = [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    W, H = 1280, 720
    canvas = gradient_bg((W, H), NAVY, NAVY_MID)
    draw = ImageDraw.Draw(canvas)

    # Subtle accent diagonal stripe top-right
    draw.polygon([(W, 0), (W, 240), (W - 360, 0)], fill=(124, 58, 237, 60))
    draw.polygon([(W, 0), (W, 140), (W - 200, 0)], fill=(6, 182, 212, 80))

    # Top label "60-SECOND DEMO"
    label_font = font(28)
    label = "60-SECOND DEMO"
    bbox = draw.textbbox((0, 0), label, font=label_font)
    label_w = bbox[2] - bbox[0]
    # Pill background
    pad_x, pad_y = 22, 10
    pill_x = 80
    pill_y = 80
    draw.rounded_rectangle(
        (pill_x, pill_y, pill_x + label_w + pad_x * 2, pill_y + 28 + pad_y * 2),
        radius=24,
        fill=ORANGE,
    )
    draw.text((pill_x + pad_x, pill_y + pad_y - 4), label, fill=NAVY, font=label_font)

    # Big headline
    h1_font = font(96)
    h2_font = font(72)
    draw.text((80, 180), "DialKaro", fill=WHITE, font=h1_font)
    draw.text(
        (80, 290),
        "AI sales dialer for India",
        fill=DIM,
        font=h2_font,
    )

    # Three feature chips — two rows so they fit left of the icon
    chip_font = font(28)
    rows = [
        [("Excel  ->  Auto-dial", PURPLE), ("Phone + WhatsApp", CYAN)],
        [("Claude AI summaries", ORANGE)],
    ]
    chip_y = 440
    for row in rows:
        chip_x = 80
        for text, color in row:
            bbox = draw.textbbox((0, 0), text, font=chip_font)
            tw = bbox[2] - bbox[0]
            chip_w = tw + 44
            draw.rounded_rectangle(
                (chip_x, chip_y, chip_x + chip_w, chip_y + 52),
                radius=26,
                fill=color,
            )
            draw.text((chip_x + 22, chip_y + 8), text, fill=WHITE, font=chip_font)
            chip_x += chip_w + 14
        chip_y += 68

    # CTA at bottom
    cta_font = font(36)
    draw.text(
        (80, 600),
        "dialkaro.celerapps.com",
        fill=WHITE,
        font=cta_font,
    )
    sub_font = font(24)
    draw.text(
        (80, 650),
        "3x more calls per day  ·  built for Indian SMBs",
        fill=DIM,
        font=sub_font,
    )

    # Right side icon — top-right, sized to clear the chip rows below
    if ICON.exists():
        icon = Image.open(ICON).convert("RGBA")
        target_h = 220
        ratio = target_h / icon.height
        new_w = int(icon.width * ratio)
        icon = icon.resize((new_w, target_h), Image.LANCZOS)
        canvas.paste(icon, (W - new_w - 80, 180), icon)

    canvas.convert("RGB").save(OUT, optimize=True, quality=95)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
