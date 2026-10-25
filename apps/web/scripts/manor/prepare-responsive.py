"""Derive high quality display sizes from the immutable, precompiled painting.
Keep the native plate for wide/high-density displays; never enlarge a variant.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2] / 'public/manor/knowledge-garden-v19/courtyard'
image = Image.open(root / 'pc-scene-r53.webp')
for width in (2048, 2940):
    size = (width, round(image.height * width / image.width))
    path = root / f'pc-scene-{width}-r54.webp'
    image.resize(size, Image.Resampling.LANCZOS).save(path, quality=96, method=6)
    print(path.name, path.stat().st_size)
