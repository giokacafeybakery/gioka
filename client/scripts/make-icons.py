"""Genera los íconos PWA (PNG) del panda Gioka sin dependencias externas más allá de Pillow."""
import math, os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

INK = (35, 35, 35, 255)
CREAM = (244, 239, 232, 255)
WHITE = (255, 253, 248, 255)
PEACH = (242, 145, 90, 255)


def ellipse_pts(cx, cy, rx, ry, angle_deg, n=90):
    a = math.radians(angle_deg)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)))
    return pts


def draw_panda(size, bg, scale=1.0, offset=(0, 0)):
    S = 4  # supersampling
    img = Image.new("RGBA", (size * S, size * S), bg)
    d = ImageDraw.Draw(img)
    u = size * S / 100 * scale
    ox, oy = offset[0] * size * S / 100, offset[1] * size * S / 100

    def P(x, y):
        return (ox + x * u, oy + y * u)

    def circle(cx, cy, r, fill):
        d.ellipse([P(cx - r, cy - r), P(cx + r, cy + r)], fill=fill)

    # ears
    circle(24, 27, 13, INK)
    circle(76, 27, 13, INK)
    # head
    circle(50, 54, 34, INK)
    circle(50, 54, 32.2, WHITE)
    # eye patches
    d.polygon([P(*p) for p in ellipse_pts(38, 50, 8.5, 12, -22)], fill=INK)
    d.polygon([P(*p) for p in ellipse_pts(62, 50, 8.5, 12, 22)], fill=INK)
    # eyes
    circle(39.5, 49, 3.6, WHITE)
    circle(60.5, 49, 3.6, WHITE)
    circle(40.2, 49.4, 2.0, INK)
    circle(59.8, 49.4, 2.0, INK)
    circle(41, 48.5, 0.7, WHITE)
    circle(60.6, 48.5, 0.7, WHITE)
    # nose
    d.polygon([P(*p) for p in ellipse_pts(50, 63, 4.6, 3.2, 0)], fill=INK)
    # mouth (smile)
    d.line([P(50, 66), P(50, 69)], fill=INK, width=int(1.8 * u))
    d.arc([P(43, 63), P(50, 73)], start=20, end=160, fill=INK, width=int(1.8 * u))
    d.arc([P(50, 63), P(57, 73)], start=20, end=160, fill=INK, width=int(1.8 * u))
    # blush
    d.polygon([P(*p) for p in ellipse_pts(29, 62, 4.5, 2.6, 0)], fill=(245, 163, 181, 160))
    d.polygon([P(*p) for p in ellipse_pts(71, 62, 4.5, 2.6, 0)], fill=(245, 163, 181, 160))
    return img.resize((size, size), Image.LANCZOS)


def rounded_bg(size, color, radius_pct=22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_pct / 100), fill=color)
    return img


for s in (192, 512):
    # Standard icon: cream rounded tile with panda
    base = rounded_bg(s, CREAM)
    panda = draw_panda(s, (0, 0, 0, 0), scale=0.82, offset=(9, 9))
    base.alpha_composite(panda)
    base.save(os.path.join(OUT, f"icon-{s}.png"))
    # Maskable: full bleed, panda in safe zone
    m = Image.new("RGBA", (s, s), CREAM)
    m.alpha_composite(draw_panda(s, (0, 0, 0, 0), scale=0.66, offset=(17, 17)))
    m.save(os.path.join(OUT, f"maskable-{s}.png"))

draw_panda(64, (0, 0, 0, 0)).save(os.path.join(OUT, "favicon-64.png"))
print("icons ok")
