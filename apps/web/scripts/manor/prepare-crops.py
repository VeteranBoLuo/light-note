"""Encode existing crop/soil colors without resizing or changing their alpha.
Original paintings stay immutable for existing clients and source comparison.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import re
from shutil import copyfile
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2] / 'public/manor/knowledge-garden-v19/farm'
sources = [p for p in root.glob('crop-*.webp') if re.fullmatch(r'crop-[a-z]+-[1-6]\.webp', p.name)]
sources += [root / 'bed-dry.webp', root / 'bed-wet-soil.webp']
def encode(source):
    image = Image.open(source).convert('RGBA')
    target = source.with_name(source.stem + '-r55.webp')
    image.save(target, quality=94, method=6, alpha_quality=100, exact=True)
    original = np.asarray(image)
    encoded = np.asarray(Image.open(target).convert('RGBA'))
    assert image.size == Image.open(target).size
    assert np.array_equal(original[:, :, 3], encoded[:, :, 3]), target.name
    opaque = original[:, :, 3] > 200
    error = abs(original[:, :, :3].astype(float) - encoded[:, :, :3].astype(float))[opaque].mean()
    # Preserve color-rich fine details where chroma compression adds more error,
    # and never ship a larger encoding just because it has a newer filename.
    if error > 6 or target.stat().st_size >= source.stat().st_size:
        copyfile(source, target)
        error = 0
    return source.stat().st_size, target.stat().st_size, error

with ThreadPoolExecutor(max_workers=4) as workers:
    results = list(workers.map(encode, sorted(sources)))
before = sum(row[0] for row in results)
after = sum(row[1] for row in results)
worst = max(row[2] for row in results)
print({'files': len(sources), 'beforeBytes': before, 'afterBytes': after, 'worstOpaqueMeanError': round(worst, 2)})
