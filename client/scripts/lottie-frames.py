"""Convierte un Lottie de "video a lottie" (secuencia de imágenes) en frames webp únicos + manifest para PandaListo.tsx.

Uso: python client/scripts/lottie-frames.py "ruta/animacion.json" client/public/anim/panda-listo
Genera NNN.webp (solo frames distintos) y manifest.json {fps, w, h, frames:[índice por frame]}.
"""
import base64, hashlib, json, os, sys

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding="utf-8"))
assets = {a["id"]: a for a in d["assets"]}
os.makedirs(out, exist_ok=True)
uniq, order = {}, []
for layer in sorted(d["layers"], key=lambda l: l["ip"]):
    b64 = assets[layer["refId"]]["p"].split(",", 1)[1]
    h = hashlib.md5(b64.encode()).hexdigest()
    if h not in uniq:
        uniq[h] = len(uniq)
        open(f"{out}/{uniq[h]:03d}.webp", "wb").write(base64.b64decode(b64))
    order.append(uniq[h])
json.dump({"fps": d["fr"], "w": d["w"], "h": d["h"], "frames": order}, open(f"{out}/manifest.json", "w"), separators=(",", ":"))
print(f"{len(order)} frames, {len(uniq)} únicos → {out}")
