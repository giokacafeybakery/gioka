"""Prepara los assets de marca a partir de logo/*.png (fondo transparente, tinta #232323):
public/brand/mark.png + mark-white.png (panda en taza), wordmark.png + wordmark-white.png (GIOKA + Café · Heladería · Bakery)
y los íconos PWA/favicon (public/icons). Requiere Pillow."""
import os
from PIL import Image, ImageOps

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SRC_MARK = os.path.join(ROOT, "logo", "logo (1).png")
SRC_WORD = os.path.join(ROOT, "logo", "logo (2).png")
BRAND = os.path.join(ROOT, "client", "public", "brand")
ICONS = os.path.join(ROOT, "client", "public", "icons")
os.makedirs(BRAND, exist_ok=True); os.makedirs(ICONS, exist_ok=True)

INK = (35, 35, 35)
CREAM = (244, 239, 232)
WHITE = (255, 253, 248)


def load_mask(path):
    """Alpha mask of the artwork, cropped to content with a small margin."""
    im = Image.open(path).convert("RGBA")
    a = im.getchannel("A").point(lambda v: 0 if v < 40 else v)  # drop faint alpha noise around the art
    box = a.point(lambda v: 255 if v > 0 else 0).getbbox()
    pad = int(max(im.size) * 0.02)
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
    return a.crop(box)


def tint(mask, rgb, max_side):
    mask = mask.copy(); mask.thumbnail((max_side, max_side), Image.LANCZOS)
    out = Image.new("RGBA", mask.size, rgb + (0,))
    out.putalpha(mask)
    return out


mark = load_mask(SRC_MARK)
word = load_mask(SRC_WORD)
tint(mark, INK, 1024).save(os.path.join(BRAND, "mark.png"), optimize=True)
tint(mark, WHITE, 1024).save(os.path.join(BRAND, "mark-white.png"), optimize=True)
tint(word, INK, 1600).save(os.path.join(BRAND, "wordmark.png"), optimize=True)
tint(word, WHITE, 1600).save(os.path.join(BRAND, "wordmark-white.png"), optimize=True)


def icon(size, bg, scale, radius_ratio=0.0):
    """Square icon: mark centred on a (optionally rounded) background."""
    S = 2
    img = Image.new("RGBA", (size * S, size * S), (0, 0, 0, 0))
    base = Image.new("RGBA", img.size, bg + (255,))
    if radius_ratio:
        m = Image.new("L", img.size, 0)
        from PIL import ImageDraw
        ImageDraw.Draw(m).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=int(img.width * radius_ratio), fill=255)
        img.paste(base, (0, 0), m)
    else:
        img = base
    art = tint(mark, INK, int(size * S * scale))
    img.alpha_composite(art, ((img.width - art.width) // 2, (img.height - art.height) // 2))
    return img.resize((size, size), Image.LANCZOS)


icon(192, CREAM, 0.72).save(os.path.join(ICONS, "icon-192.png"), optimize=True)
icon(512, CREAM, 0.72).save(os.path.join(ICONS, "icon-512.png"), optimize=True)
icon(512, CREAM, 0.58).save(os.path.join(ICONS, "icon-maskable-512.png"), optimize=True)  # safe zone for maskable
icon(180, CREAM, 0.72).save(os.path.join(ICONS, "apple-touch-icon.png"), optimize=True)
icon(64, CREAM, 0.78, radius_ratio=0.22).save(os.path.join(ICONS, "favicon.png"), optimize=True)
print("brand assets ok")
