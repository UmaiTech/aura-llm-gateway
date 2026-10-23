"""Resize and compress capture.mjs output into assets/readme/.

usage: python3 scripts/readme-screenshots/optimize.py <capture-dir>
Banners become WebP (they keep their transparent rounded corners and their
gradients band as 256-colour PNG); screenshots become 1600 px progressive JPEG.
"""
import sys
from pathlib import Path

from PIL import Image

src = Path(sys.argv[1])
dst = Path(__file__).resolve().parents[2] / "assets" / "readme"
dst.mkdir(parents=True, exist_ok=True)

for scheme in ("dark", "light"):
    banner = src / f"banner-{scheme}.png"
    if banner.exists():
        im = Image.open(banner).resize((1920, 660), Image.LANCZOS)
        im.save(dst / f"banner-{scheme}.webp", quality=90, method=6)
    for name in ("landing", "playground", "admin", "routing-lab"):
        shot = src / f"{name}-{scheme}.png"
        if not shot.exists():
            continue
        im = Image.open(shot).convert("RGB")
        width = 1600
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(dst / f"{name}-{scheme}.jpg", quality=84, optimize=True, progressive=True)
